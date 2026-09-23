import { randomInt, randomUUID } from 'node:crypto';
import {
  ART_GENERATIONS_PER_CHAPTER,
  applyTurnResolution,
  areAllPlayersOnline,
  makeRoll,
  startCampaign,
  toCampaignView,
  TurnResolutionSchema,
  type ActionInput,
  type AuthenticatedPlayer,
  type CampaignState,
  type CampaignView,
  type ChapterFeedback,
  type ContentSettings,
  type CreateCampaignInput,
  type TurnRecord,
} from '@family-adventure/shared';
import { nanoid } from 'nanoid';
import { ApiError } from '../errors.js';
import type { NarrativeProvider } from '../providers/narrative-provider.js';
import type { GameRepository } from '../repositories/game-repository.js';
import type { MediaService } from './media-service.js';
import type { MemoryService } from './memory-service.js';
import type { ModelArmorService } from './model-armor.js';

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly narrative: NarrativeProvider,
    private readonly armor: ModelArmorService,
    private readonly memory: MemoryService,
    private readonly media: MediaService,
  ) {}

  async listCampaigns(player: AuthenticatedPlayer): Promise<CampaignView[]> {
    const campaigns = await this.repository.listCampaigns(player.familyId);
    return campaigns
      .filter((campaign) => campaign.playerOrder.includes(player.id))
      .map(toCampaignView);
  }

  async getCampaign(player: AuthenticatedPlayer, campaignId: string): Promise<CampaignView> {
    return toCampaignView(await this.authorizedCampaign(player, campaignId));
  }

  async exportCampaign(
    player: AuthenticatedPlayer,
    campaignId: string,
  ): Promise<{ exportedAt: string; campaign: CampaignState; turns: TurnRecord[] }> {
    const campaign = await this.authorizedCampaign(player, campaignId);
    if (player.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'Only the parent can export a campaign.');
    }
    return {
      exportedAt: new Date().toISOString(),
      campaign,
      turns: await this.repository.listTurns(campaignId),
    };
  }

  async createCampaign(
    player: AuthenticatedPlayer,
    input: CreateCampaignInput,
  ): Promise<CampaignView> {
    if (player.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'Only the parent can create a new campaign.');
    }
    await this.armor.screenPrompt(`${input.title}\n${input.premise}`);
    const profiles = await this.repository.getFamilyProfiles(player.familyId);
    const parent = profiles.find((profile) => profile.role === 'parent');
    const children = profiles.filter((profile) => profile.role === 'child');
    if (!parent || children.length === 0) {
      throw new ApiError(
        409,
        'players_required',
        'Create the child adventurer profile before starting a campaign.',
      );
    }
    const requestedPlayerIds: string[] = input.playerIds ?? [parent.id, children[0]!.id];
    const uniquePlayerIds = [...new Set(requestedPlayerIds)];
    const selectedPlayers = uniquePlayerIds
      .map((id) => profiles.find((profile) => profile.id === id))
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
    if (
      uniquePlayerIds.length < 2 ||
      uniquePlayerIds.length > 3 ||
      selectedPlayers.length !== uniquePlayerIds.length ||
      !uniquePlayerIds.includes(parent.id) ||
      selectedPlayers.filter((profile) => profile.role === 'child').length < 1
    ) {
      throw new ApiError(
        400,
        'invalid_players',
        'Choose the parent and one or two young adventurers from this family.',
      );
    }
    const plan = await this.narrative.planCampaign({ ...input, playerIds: uniquePlayerIds });
    await this.armor.screenResponse(JSON.stringify(plan));
    const campaign = await this.repository.createCampaign(
      player.familyId,
      input,
      selectedPlayers,
      plan,
    );
    return toCampaignView(campaign);
  }

  async updatePresence(
    player: AuthenticatedPlayer,
    campaignId: string,
    sessionId: string,
  ): Promise<CampaignView> {
    await this.authorizedCampaign(player, campaignId);
    const campaign = await this.repository.updatePresence(
      campaignId,
      player.id,
      sessionId,
      new Date(),
    );
    return toCampaignView(campaign);
  }

  async updateContentSettings(
    player: AuthenticatedPlayer,
    campaignId: string,
    settings: ContentSettings,
  ): Promise<CampaignView> {
    await this.authorizedCampaign(player, campaignId);
    if (player.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'Only the parent can change story boundaries.');
    }
    return toCampaignView(await this.repository.updateContentSettings(campaignId, settings));
  }

  async start(player: AuthenticatedPlayer, campaignId: string): Promise<CampaignView> {
    const campaign = await this.authorizedCampaign(player, campaignId);
    if (player.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'The parent starts each chapter.');
    }
    try {
      const next = startCampaign(campaign);
      return toCampaignView(await this.repository.commitTransition({ previous: campaign, next }));
    } catch (error) {
      throw new ApiError(409, 'cannot_start', this.safeRuleMessage(error));
    }
  }

  async act(
    player: AuthenticatedPlayer,
    campaignId: string,
    input: ActionInput,
  ): Promise<{ campaign: CampaignView; replayed: boolean }> {
    const campaign = await this.authorizedCampaign(player, campaignId);
    const existing = campaign.recentTurns.find(
      (turn) => turn.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { campaign: toCampaignView(campaign), replayed: true };
    if (campaign.activePlayerId !== player.id) {
      throw new ApiError(409, 'not_your_turn', 'The other adventurer has the spotlight right now.');
    }
    if (!areAllPlayersOnline(campaign)) {
      throw new ApiError(
        409,
        'all_players_required',
        'Every adventurer in this campaign must be online before the story can continue.',
      );
    }
    const actor = campaign.players.find((candidate) => candidate.id === player.id);
    if (!actor) throw new ApiError(403, 'not_a_player', 'You are not part of this campaign.');
    if (input.useSpecialMove && !actor.specialMoveAvailable) {
      throw new ApiError(
        409,
        'special_move_used',
        'That special move has already been used this chapter.',
      );
    }
    const claimed = await this.repository.claimAction(
      campaignId,
      campaign.version,
      input.idempotencyKey,
    );
    if (!claimed) {
      throw new ApiError(409, 'action_in_progress', 'That action is already being resolved.');
    }

    try {
      const memories = await this.memory.retrieve(campaignId, input.action);
      const proposedResolution = await this.narrative.resolveTurn({
        campaign,
        actor,
        action: input.action,
        useSpecialMove: input.useSpecialMove,
        memories,
        rollCheck: ({ trait, difficulty, reason }) =>
          makeRoll({
            id: `roll-${nanoid(12)}`,
            player: actor,
            trait,
            difficulty,
            reason,
            random: () => randomInt(0, 4_294_967_296) / 4_294_967_296,
          }),
      });
      const validatedResolution = TurnResolutionSchema.safeParse(proposedResolution);
      if (!validatedResolution.success) {
        throw new Error('Narrative provider returned invalid structured output.');
      }
      const chapterArtPending =
        campaign.artGenerationsThisChapter < ART_GENERATIONS_PER_CHAPTER &&
        !campaign.currentUi.sceneArtUrl;
      const resolution = {
        ...validatedResolution.data,
        uiDirective: {
          ...validatedResolution.data.uiDirective,
          artNeeded:
            chapterArtPending &&
            campaign.currentUi.artNeeded &&
            Boolean(campaign.currentUi.artPrompt),
          artPrompt: chapterArtPending ? campaign.currentUi.artPrompt : null,
          sceneArtUrl: campaign.currentUi.sceneArtUrl,
        },
      };
      await this.armor.screenResponse(resolution.narration);
      if (resolution.uiDirective.artPrompt) {
        await this.armor.screenResponse(resolution.uiDirective.artPrompt);
      }
      const applied = applyTurnResolution({
        campaign,
        actorId: player.id,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
        resolution,
        turnId: `turn-${randomUUID()}`,
        useSpecialMove: input.useSpecialMove,
      });
      const storedMemories = await this.memory.prepare({
        campaignId,
        familyId: player.familyId,
        chapterNumber: campaign.chapterNumber,
        turnId: applied.turn.id,
        writes: resolution.memoryWrites,
      });
      const committed = await this.repository.commitTransition({
        previous: campaign,
        next: applied.campaign,
        turn: applied.turn,
        memories: storedMemories,
      });
      return { campaign: toCampaignView(committed), replayed: false };
    } catch (error) {
      await this.repository.releaseAction(campaignId, campaign.version, input.idempotencyKey);
      if (error instanceof ApiError) throw error;
      const message = error instanceof Error ? error.message : 'The action could not be resolved.';
      if (
        /not currently active|not this player|every adventurer|already been resolved/i.test(message)
      ) {
        throw new ApiError(409, 'invalid_game_state', message);
      }
      throw error;
    }
  }

  async rewind(player: AuthenticatedPlayer, campaignId: string): Promise<CampaignView> {
    await this.authorizedCampaign(player, campaignId);
    if (player.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'Only the parent can rewind the story.');
    }
    try {
      return toCampaignView(await this.repository.rewind(campaignId));
    } catch (error) {
      throw new ApiError(409, 'cannot_rewind', this.safeRuleMessage(error));
    }
  }

  async generateArt(player: AuthenticatedPlayer, campaignId: string): Promise<CampaignView> {
    await this.authorizedCampaign(player, campaignId);
    return this.generateArtForCampaign(campaignId);
  }

  async generateArtForCampaign(campaignId: string): Promise<CampaignView> {
    const current = await this.repository.getCampaign(campaignId);
    if (!current)
      throw new ApiError(404, 'campaign_not_found', 'That campaign could not be found.');
    const campaign = await this.repository.claimSceneArt(campaignId);
    if (!campaign) return toCampaignView(current);
    try {
      const url = await this.media.generateSceneArt(campaign);
      if (!url) {
        await this.repository.releaseSceneArt(campaignId, campaign.chapterNumber);
        return toCampaignView(campaign);
      }
      return toCampaignView(
        await this.repository.setSceneArt(campaignId, campaign.chapterNumber, url),
      );
    } catch (error) {
      await this.repository.releaseSceneArt(campaignId, campaign.chapterNumber);
      throw error;
    }
  }

  async narrationAudio(player: AuthenticatedPlayer, turnId: string): Promise<Buffer | null> {
    const turn = await this.repository.getTurn(turnId);
    if (!turn) throw new ApiError(404, 'turn_not_found', 'That moment could not be found.');
    await this.authorizedCampaign(player, turn.campaignId);
    return this.media.synthesizeSpeech(turn.narration, turn.id);
  }

  async feedback(
    player: AuthenticatedPlayer,
    campaignId: string,
    feedback: ChapterFeedback,
  ): Promise<void> {
    const campaign = await this.authorizedCampaign(player, campaignId);
    if (campaign.status !== 'chapter_complete') {
      throw new ApiError(409, 'chapter_not_complete', 'Finish the chapter before rating it.');
    }
    await this.repository.saveFeedback(campaignId, player, feedback);
  }

  async delete(player: AuthenticatedPlayer, campaignId: string): Promise<void> {
    await this.authorizedCampaign(player, campaignId);
    if (player.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'Only the parent can delete a campaign.');
    }
    const turns = await this.repository.listTurns(campaignId);
    await this.repository.deleteCampaign(campaignId);
    try {
      await this.media.purgeCampaignAssets(
        campaignId,
        turns.map((turn) => turn.id),
      );
    } catch {
      console.warn(
        JSON.stringify({ level: 'warn', event: 'immediate_media_purge_deferred', campaignId }),
      );
    }
  }

  async purgeDueCampaigns(): Promise<number> {
    const campaignIds = await this.repository.findDueDeletions(new Date(), 20);
    for (const campaignId of campaignIds) {
      const turns = await this.repository.listTurns(campaignId);
      await this.media.purgeCampaignAssets(
        campaignId,
        turns.map((turn) => turn.id),
      );
      await this.repository.purgeCampaignRecords(campaignId);
    }
    return campaignIds.length;
  }

  private async authorizedCampaign(player: AuthenticatedPlayer, campaignId: string) {
    const campaign = await this.repository.getCampaign(campaignId);
    if (!campaign || campaign.familyId !== player.familyId) {
      throw new ApiError(404, 'campaign_not_found', 'That campaign could not be found.');
    }
    if (!campaign.playerOrder.includes(player.id)) {
      throw new ApiError(403, 'not_a_player', 'You are not part of this campaign.');
    }
    return campaign;
  }

  private safeRuleMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'The game cannot do that right now.';
  }
}
