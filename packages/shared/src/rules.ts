import type {
  CampaignView,
  CampaignState,
  Difficulty,
  PlayerProfile,
  RollOutcome,
  RollRecord,
  TraitName,
  TurnRecord,
  TurnResolution,
} from './schemas.js';
import { CampaignStateSchema } from './schemas.js';

export const DIFFICULTY_DC: Record<Difficulty, number> = {
  easy: 8,
  tricky: 11,
  hard: 14,
};

export const PRESENCE_TTL_MS = 45_000;
export const ART_GENERATIONS_PER_CHAPTER = 1;

export function toCampaignView(campaign: CampaignState): CampaignView {
  const { gmBible, ...view } = CampaignStateSchema.parse(campaign);
  void gmBible;
  return view;
}

export function isPlayerOnline(
  campaign: CampaignState,
  playerId: string,
  now = Date.now(),
): boolean {
  const presence = campaign.presence[playerId];
  if (!presence) return false;
  return now - new Date(presence.lastSeenAt).getTime() <= PRESENCE_TTL_MS;
}

export function areAllPlayersOnline(campaign: CampaignState, now = Date.now()): boolean {
  return campaign.playerOrder.every((playerId) => isPlayerOnline(campaign, playerId, now));
}

/** Kept for existing callers while campaigns expand from two to three players. */
export const areBothPlayersOnline = areAllPlayersOnline;

export function nextPlayerId(campaign: CampaignState, currentPlayerId: string): string {
  const index = campaign.playerOrder.indexOf(currentPlayerId);
  if (index < 0) throw new Error('Current player does not belong to this campaign.');
  return campaign.playerOrder[(index + 1) % campaign.playerOrder.length] as string;
}

export function outcomeFor(total: number, dc: number): RollOutcome {
  if (total >= dc + 5) return 'great_success';
  if (total >= dc) return 'success';
  if (total >= dc - 3) return 'success_with_complication';
  return 'setback';
}

export function makeRoll(params: {
  id: string;
  player: PlayerProfile;
  trait: TraitName;
  difficulty: Difficulty;
  reason: string;
  random?: () => number;
}): RollRecord {
  const random = params.random ?? Math.random;
  const die = Math.floor(random() * 20) + 1;
  const modifier = params.player.traits[params.trait];
  const dc = DIFFICULTY_DC[params.difficulty];
  const total = die + modifier;

  return {
    id: params.id,
    playerId: params.player.id,
    trait: params.trait,
    difficulty: params.difficulty,
    dc,
    die,
    modifier,
    total,
    outcome: outcomeFor(total, dc),
    reason: params.reason,
  };
}

export function startCampaign(campaign: CampaignState, now = new Date()): CampaignState {
  if (campaign.status !== 'lobby' && campaign.status !== 'chapter_complete') {
    throw new Error('This campaign cannot be started from its current state.');
  }
  if (!areAllPlayersOnline(campaign, now.getTime())) {
    throw new Error(
      'Every adventurer in this campaign must be online before the story can continue.',
    );
  }

  const nextChapter = campaign.status === 'chapter_complete' ? campaign.chapterNumber + 1 : 1;
  const continuingFromPreviousChapter = campaign.status === 'chapter_complete';
  const players = campaign.players.map((player) => ({
    ...player,
    specialMoveAvailable: true,
    chapterStars:
      campaign.status === 'chapter_complete' ? player.chapterStars + 1 : player.chapterStars,
    traits:
      campaign.status === 'chapter_complete' && (player.chapterStars + 1) % 3 === 0
        ? improveLowestTrait(player.traits)
        : player.traits,
  }));

  return {
    ...campaign,
    status: 'active',
    chapterNumber: nextChapter,
    turnsInChapter: 0,
    activePlayerId: campaign.playerOrder[(nextChapter - 1) % campaign.playerOrder.length] as string,
    players,
    currentUi: continuingFromPreviousChapter
      ? {
          ...campaign.currentUi,
          artNeeded: true,
          artPrompt: nextChapterArtPrompt(campaign, nextChapter),
          sceneArtUrl: null,
        }
      : campaign.currentUi,
    artGenerationsThisChapter: continuingFromPreviousChapter
      ? 0
      : campaign.artGenerationsThisChapter,
    updatedAt: now.toISOString(),
    version: campaign.version + 1,
  };
}

function nextChapterArtPrompt(campaign: CampaignState, nextChapter: number): string {
  const finalScene = campaign.recentTurns.at(-1)?.narration ?? campaign.lastNarration;
  const prompt = `Opening image for chapter ${nextChapter}, continuing directly from the final scene of chapter ${campaign.chapterNumber}. Location: ${campaign.world.location}. Environment: ${campaign.world.locationDescription}. Final scene: ${finalScene} Preserve the established setting and any described recurring characters. Show the immediate aftermath or next breath of this exact moment, not a generic new adventure.`;
  return prompt.length <= 700 ? prompt : `${prompt.slice(0, 699).trimEnd()}…`;
}

function uniqueAppend(values: string[], additions: string[], max: number): string[] {
  return [...new Set([...values, ...additions])].slice(-max);
}

export function applyTurnResolution(params: {
  campaign: CampaignState;
  actorId: string;
  action: string;
  idempotencyKey: string;
  resolution: TurnResolution;
  turnId: string;
  now?: Date;
  useSpecialMove?: boolean;
}): { campaign: CampaignState; turn: TurnRecord } {
  const { campaign, actorId, resolution } = params;
  const now = params.now ?? new Date();

  if (campaign.status !== 'active') throw new Error('The campaign is not currently active.');
  if (campaign.activePlayerId !== actorId) throw new Error('It is not this player’s turn.');
  if (!areAllPlayersOnline(campaign, now.getTime())) {
    throw new Error('Every adventurer in this campaign must be online to advance the story.');
  }
  if (campaign.recentTurns.some((turn) => turn.idempotencyKey === params.idempotencyKey)) {
    throw new Error('This action has already been resolved.');
  }

  const expectedNextPlayer = nextPlayerId(campaign, actorId);
  const playerIds = new Set(campaign.playerOrder);
  const patch = resolution.worldPatch;
  const players = campaign.players.map((player) => {
    const additions = patch.addInventory
      .filter((item) => item.playerId === player.id)
      .map((item) => item.item);
    const removals = new Set(
      patch.removeInventory.filter((item) => item.playerId === player.id).map((item) => item.item),
    );
    const addedConditions = patch.addConditions
      .filter((item) => item.playerId === player.id)
      .map((item) => item.condition);
    const clearedConditions = new Set(
      patch.clearConditions
        .filter((item) => item.playerId === player.id)
        .map((item) => item.condition),
    );

    return {
      ...player,
      specialMoveAvailable:
        player.id === actorId && params.useSpecialMove ? false : player.specialMoveAvailable,
      inventory: uniqueAppend(
        player.inventory.filter((item) => !removals.has(item)),
        additions,
        20,
      ),
      conditions: uniqueAppend(
        player.conditions.filter((condition) => !clearedConditions.has(condition)),
        addedConditions,
        3,
      ),
    };
  });

  for (const mutation of [
    ...patch.addInventory,
    ...patch.removeInventory,
    ...patch.addConditions,
    ...patch.clearConditions,
  ]) {
    if (!playerIds.has(mutation.playerId))
      throw new Error('World patch targets an unknown player.');
  }

  const quests = [...campaign.world.quests];
  for (const update of resolution.questUpdates) {
    const index = quests.findIndex((quest) => quest.id === update.questId);
    const quest = {
      id: update.questId,
      title: update.title,
      description: update.description,
      status: update.status,
    };
    if (index >= 0) quests[index] = quest;
    else quests.push(quest);
  }

  const turnNumber = campaign.totalTurns + 1;
  const turn: TurnRecord = {
    id: params.turnId,
    campaignId: campaign.id,
    chapterNumber: campaign.chapterNumber,
    turnNumber,
    playerId: actorId,
    playerAction: params.action,
    narration: resolution.narration,
    rolls: resolution.rolls,
    uiDirective: resolution.uiDirective,
    createdAt: now.toISOString(),
    idempotencyKey: params.idempotencyKey,
  };

  const turnsInChapter = campaign.turnsInChapter + 1;
  const chapterMayComplete = turnsInChapter >= 10;
  const chapterMustComplete = turnsInChapter >= 14;
  const complete =
    chapterMustComplete || (chapterMayComplete && resolution.chapterStatus.state === 'complete');

  return {
    turn,
    campaign: {
      ...campaign,
      status: complete ? 'chapter_complete' : 'active',
      updatedAt: now.toISOString(),
      turnsInChapter,
      totalTurns: turnNumber,
      activePlayerId: complete ? null : expectedNextPlayer,
      players,
      world: {
        ...campaign.world,
        location: patch.location ?? campaign.world.location,
        locationDescription: patch.locationDescription ?? campaign.world.locationDescription,
        theme: resolution.uiDirective.theme,
        mood: resolution.uiDirective.mood,
        discoveredFacts: uniqueAppend(campaign.world.discoveredFacts, patch.addFacts, 100),
        quests: quests.slice(-20),
      },
      currentUi: {
        ...resolution.uiDirective,
        sceneArtUrl: resolution.uiDirective.sceneArtUrl ?? campaign.currentUi.sceneArtUrl,
      },
      lastNarration: resolution.narration,
      lastRolls: resolution.rolls,
      recentTurns: [...campaign.recentTurns, turn].slice(-30),
      version: campaign.version + 1,
    },
  };
}

function improveLowestTrait(traits: PlayerProfile['traits']): PlayerProfile['traits'] {
  const next = { ...traits };
  const candidate = (Object.entries(next) as Array<[TraitName, number]>)
    .filter(([, value]) => value < 3)
    .sort((a, b) => a[1] - b[1])[0];
  if (candidate) next[candidate[0]] += 1;
  return next;
}

export function chooseTraitForAction(action: string): TraitName {
  const text = action.toLowerCase();
  if (/climb|lift|push|break|fight|shield|hold/.test(text)) return 'might';
  if (/sneak|dodge|jump|run|balance|aim|hide/.test(text)) return 'agility';
  if (/inspect|solve|read|search|invent|plan|remember/.test(text)) return 'wits';
  return 'heart';
}

export function chooseDifficultyForAction(action: string): Difficulty {
  const text = action.toLowerCase();
  if (/dragon|impossible|alone|leap across|ancient curse/.test(text)) return 'hard';
  if (/carefully|help|together|use my|ask|talk/.test(text)) return 'easy';
  return 'tricky';
}
