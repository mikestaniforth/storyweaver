import {
  ART_GENERATIONS_PER_CHAPTER,
  createDemoCampaign,
  createPlannedCampaign,
  demoPlayers,
  demoThirdPlayer,
  type AuthenticatedPlayer,
  type CampaignState,
  type ChapterFeedback,
  type ContentSettings,
  type CreateCampaignInput,
  type GmBible,
  type PlayerProfile,
  type TurnRecord,
} from '@family-adventure/shared';
import { nanoid } from 'nanoid';
import type {
  BootstrapData,
  ChildCredential,
  CreateChildInput,
  FamilyRecord,
  GameRepository,
  StoredMemory,
} from './game-repository.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

const archetypeTraits: Record<PlayerProfile['archetype'], PlayerProfile['traits']> = {
  guardian: { might: 2, agility: 0, wits: 1, heart: 3 },
  scout: { might: 0, agility: 3, wits: 2, heart: 1 },
  inventor: { might: 0, agility: 1, wits: 3, heart: 2 },
  storykeeper: { might: 1, agility: 0, wits: 2, heart: 3 },
};

const specialMoves: Record<PlayerProfile['archetype'], string> = {
  guardian: 'Stand Together — turn a setback into a success with a complication.',
  scout: 'Foxstep — slip through danger without making a roll.',
  inventor: 'Bright Idea — reveal a useful tool you prepared earlier.',
  storykeeper: 'Old Tale — remember a clue everyone else overlooked.',
};

export class InMemoryGameRepository implements GameRepository {
  private readonly profiles = new Map<string, PlayerProfile>();
  private readonly families = new Map<string, FamilyRecord>();
  private readonly campaigns = new Map<string, CampaignState>();
  private readonly snapshots = new Map<string, CampaignState>();
  private readonly actionClaims = new Set<string>();
  private readonly artClaims = new Set<string>();
  private readonly dailyUsage = new Map<string, number>();
  private readonly memories = new Map<string, StoredMemory[]>();
  private readonly patterns = new Map<string, StoredMemory[]>();
  private readonly feedback: Array<
    ChapterFeedback & { campaignId: string; playerId: string; chapterNumber: number }
  > = [];

  constructor(seedDemo = true) {
    if (seedDemo) {
      const [parent, child] = demoPlayers();
      this.profiles.set(parent.id, parent);
      this.profiles.set(child.id, child);
      const thirdPlayer = demoThirdPlayer();
      this.profiles.set(thirdPlayer.id, thirdPlayer);
      this.families.set('demo-family', {
        id: 'demo-family',
        parentUid: parent.id,
        familyCode: 'STARLIGHT',
        familyCodeHash: 'demo-family-code-hash',
        pinSalt: 'demo-salt',
        pinHash: 'demo-pin-hash',
        failedPinAttempts: 0,
        lockedUntil: null,
        childProfileId: child.id,
        childProfileIds: [child.id, thirdPlayer.id],
        createdAt: new Date().toISOString(),
      });
      const campaign = createDemoCampaign();
      this.campaigns.set(campaign.id, campaign);
    }
  }

  async getProfile(playerId: string): Promise<PlayerProfile | null> {
    return clone(this.profiles.get(playerId) ?? null);
  }

  async getFamilyProfiles(familyId: string): Promise<PlayerProfile[]> {
    return clone([...this.profiles.values()].filter((profile) => profile.familyId === familyId));
  }

  async bootstrapParent(uid: string, displayName: string): Promise<BootstrapData> {
    let parent = this.profiles.get(uid);
    let family = [...this.families.values()].find((candidate) => candidate.parentUid === uid);
    if (!parent || !family) {
      const familyId = `family-${nanoid(10)}`;
      family = {
        id: familyId,
        parentUid: uid,
        familyCode: nanoid(8).toUpperCase(),
        familyCodeHash: '',
        pinSalt: null,
        pinHash: null,
        failedPinAttempts: 0,
        lockedUntil: null,
        childProfileId: null,
        childProfileIds: [],
        createdAt: new Date().toISOString(),
      };
      parent = {
        id: uid,
        familyId,
        role: 'parent',
        displayName: displayName.slice(0, 30) || 'Parent',
        avatar: '🛡️',
        ageBand: 'adult',
        archetype: 'guardian',
        traits: archetypeTraits.guardian,
        inventory: ['Travel cloak'],
        conditions: [],
        specialMove: specialMoves.guardian,
        specialMoveAvailable: true,
        chapterStars: 0,
      };
      this.profiles.set(uid, parent);
      this.families.set(familyId, family);
    }

    const profiles = [...this.profiles.values()].filter(
      (profile) => profile.familyId === family?.id,
    );
    return { family: this.familySummary(family), profiles: clone(profiles) };
  }

  async createChildProfile(
    parent: AuthenticatedPlayer,
    input: CreateChildInput,
  ): Promise<BootstrapData> {
    const family = this.families.get(parent.familyId);
    if (!family || family.parentUid !== parent.id) throw new Error('Family not found.');
    const childProfileIds =
      family.childProfileIds ?? (family.childProfileId ? [family.childProfileId] : []);
    if (childProfileIds.length >= 2) {
      throw new Error('This family already has two young adventurer profiles.');
    }
    const nameTaken = [...this.profiles.values()].some(
      (profile) =>
        profile.familyId === family.id &&
        profile.role === 'child' &&
        profile.displayName.toLocaleLowerCase() === input.displayName.toLocaleLowerCase(),
    );
    if (nameTaken) {
      throw new Error('Choose a different adventure name for each young adventurer.');
    }
    if ((!family.pinSalt || !family.pinHash) && (!input.pinSalt || !input.pinHash)) {
      throw new Error('A family PIN is required for the first young adventurer.');
    }
    const childId = `child-${nanoid(12)}`;
    const child: PlayerProfile = {
      id: childId,
      familyId: family.id,
      role: 'child',
      displayName: input.displayName,
      avatar: input.avatar,
      ageBand: '8-12',
      archetype: input.archetype,
      traits: archetypeTraits[input.archetype],
      inventory: ['Pocket lantern'],
      conditions: [],
      specialMove: specialMoves[input.archetype],
      specialMoveAvailable: true,
      chapterStars: 0,
    };
    family.childProfileId ??= childId;
    family.childProfileIds = [...childProfileIds, childId];
    if (input.pinSalt && input.pinHash) {
      family.pinSalt = input.pinSalt;
      family.pinHash = input.pinHash;
    }
    this.profiles.set(childId, child);
    return {
      family: this.familySummary(family),
      profiles: clone(
        [...this.profiles.values()].filter((profile) => profile.familyId === family.id),
      ),
    };
  }

  async findChildCredential(
    familyCodeHash: string,
    adventurerName?: string,
  ): Promise<ChildCredential | null> {
    const family =
      [...this.families.values()].find(
        (candidate) =>
          candidate.familyCodeHash === familyCodeHash ||
          (candidate.id === 'demo-family' && familyCodeHash === 'demo-family-code-hash'),
      ) ?? null;
    if (!family) return null;
    const profiles = [...this.profiles.values()].filter(
      (profile) => profile.familyId === family.id && profile.role === 'child',
    );
    const normalizedName = adventurerName?.trim().toLocaleLowerCase();
    const profile = normalizedName
      ? profiles.find((candidate) => candidate.displayName.toLocaleLowerCase() === normalizedName)
      : profiles.length === 1
        ? profiles[0]
        : null;
    return profile ? { family: clone(family), profile: clone(profile) } : null;
  }

  async rotateFamilyCode(parent: AuthenticatedPlayer): Promise<BootstrapData> {
    const family = this.families.get(parent.familyId);
    if (!family || family.parentUid !== parent.id) throw new Error('Family not found.');
    if (family.id !== 'demo-family') family.familyCode = nanoid(8).toUpperCase();
    return {
      family: this.familySummary(family),
      profiles: await this.getFamilyProfiles(parent.familyId),
    };
  }

  async recordPinAttempt(familyId: string, success: boolean): Promise<void> {
    const family = this.families.get(familyId);
    if (!family) return;
    if (success) {
      family.failedPinAttempts = 0;
      family.lockedUntil = null;
      return;
    }
    const lockExpired = Boolean(
      family.lockedUntil && new Date(family.lockedUntil).getTime() <= Date.now(),
    );
    family.failedPinAttempts = lockExpired ? 1 : family.failedPinAttempts + 1;
    family.lockedUntil = null;
    if (family.failedPinAttempts >= 5) {
      family.lockedUntil = new Date(Date.now() + 15 * 60_000).toISOString();
    }
  }

  private familySummary(family: FamilyRecord): BootstrapData['family'] {
    return {
      id: family.id,
      familyCode: family.familyCode,
      childProfileId: family.childProfileId,
      childProfileIds:
        family.childProfileIds ?? (family.childProfileId ? [family.childProfileId] : []),
    };
  }

  async consumeDailyQuota(
    familyId: string,
    kind: 'story' | 'media',
    limit: number,
  ): Promise<boolean> {
    const date = new Date().toISOString().slice(0, 10);
    const key = `${familyId}:${date}:${kind}`;
    const used = this.dailyUsage.get(key) ?? 0;
    if (used >= limit) return false;
    this.dailyUsage.set(key, used + 1);
    return true;
  }

  async listCampaigns(familyId: string): Promise<CampaignState[]> {
    return clone(
      [...this.campaigns.values()]
        .filter((campaign) => campaign.familyId === familyId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  async getCampaign(campaignId: string): Promise<CampaignState | null> {
    return clone(this.campaigns.get(campaignId) ?? null);
  }

  async getTurn(turnId: string): Promise<TurnRecord | null> {
    for (const campaign of this.campaigns.values()) {
      const turn = campaign.recentTurns.find((candidate) => candidate.id === turnId);
      if (turn) return clone(turn);
    }
    return null;
  }

  async listTurns(campaignId: string): Promise<TurnRecord[]> {
    return clone(this.campaigns.get(campaignId)?.recentTurns ?? []);
  }

  async createCampaign(
    familyId: string,
    input: CreateCampaignInput,
    players: PlayerProfile[],
    gmBible?: GmBible,
  ): Promise<CampaignState> {
    const campaign = createPlannedCampaign(
      `campaign-${nanoid(12)}`,
      familyId,
      input,
      players,
      gmBible,
    );
    this.campaigns.set(campaign.id, clone(campaign));
    return campaign;
  }

  async updatePresence(
    campaignId: string,
    playerId: string,
    sessionId: string,
    now: Date,
  ): Promise<CampaignState> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found.');
    campaign.presence[playerId] = { playerId, sessionId, lastSeenAt: now.toISOString() };
    return clone(campaign);
  }

  async updateContentSettings(
    campaignId: string,
    settings: ContentSettings,
  ): Promise<CampaignState> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found.');
    campaign.contentSettings = clone(settings);
    campaign.updatedAt = new Date().toISOString();
    campaign.version += 1;
    return clone(campaign);
  }

  async claimAction(
    campaignId: string,
    expectedVersion: number,
    _idempotencyKey: string,
  ): Promise<boolean> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.version !== expectedVersion) return false;
    const key = `${campaignId}:${expectedVersion}`;
    if (this.actionClaims.has(key)) return false;
    this.actionClaims.add(key);
    return true;
  }

  async releaseAction(
    campaignId: string,
    expectedVersion: number,
    _idempotencyKey: string,
  ): Promise<void> {
    this.actionClaims.delete(`${campaignId}:${expectedVersion}`);
  }

  async claimSceneArt(campaignId: string): Promise<CampaignState | null> {
    const campaign = this.campaigns.get(campaignId);
    if (
      !campaign ||
      !campaign.currentUi.artNeeded ||
      campaign.artGenerationsThisChapter >= ART_GENERATIONS_PER_CHAPTER
    ) {
      return null;
    }
    const key = `${campaignId}:chapter:${campaign.chapterNumber}`;
    if (this.artClaims.has(key)) return null;
    this.artClaims.add(key);
    return clone(campaign);
  }

  async releaseSceneArt(campaignId: string, chapterNumber: number): Promise<void> {
    this.artClaims.delete(`${campaignId}:chapter:${chapterNumber}`);
  }

  async commitTransition(params: {
    previous: CampaignState;
    next: CampaignState;
    turn?: TurnRecord;
    memories?: StoredMemory[];
  }): Promise<CampaignState> {
    const current = this.campaigns.get(params.previous.id);
    if (!current || current.version !== params.previous.version) {
      throw new Error('Campaign changed while this action was being resolved.');
    }
    this.snapshots.set(`${params.previous.id}:${params.previous.version}`, clone(params.previous));
    this.campaigns.set(params.next.id, clone(params.next));
    if (params.memories?.length) {
      this.memories.set(params.next.id, [
        ...(this.memories.get(params.next.id) ?? []),
        ...clone(params.memories),
      ]);
    }
    return clone(params.next);
  }

  async rewind(campaignId: string): Promise<CampaignState> {
    const current = this.campaigns.get(campaignId);
    if (!current) throw new Error('Campaign not found.');
    const snapshot = this.snapshots.get(`${campaignId}:${current.version - 1}`);
    if (!snapshot) throw new Error('There is no previous turn to rewind.');
    const discardedTurn = current.recentTurns.at(-1);
    const rewound = {
      ...clone(snapshot),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.campaigns.set(campaignId, rewound);
    if (discardedTurn) {
      this.memories.set(
        campaignId,
        (this.memories.get(campaignId) ?? []).filter(
          (memory) => memory.turnId !== discardedTurn.id,
        ),
      );
      this.actionClaims.delete(`${campaignId}:${current.version - 1}`);
    }
    return clone(rewound);
  }

  async setSceneArt(
    campaignId: string,
    chapterNumber: number,
    url: string,
  ): Promise<CampaignState> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found.');
    this.artClaims.delete(`${campaignId}:chapter:${chapterNumber}`);
    if (
      campaign.chapterNumber !== chapterNumber ||
      campaign.artGenerationsThisChapter >= ART_GENERATIONS_PER_CHAPTER
    )
      return clone(campaign);
    campaign.currentUi.sceneArtUrl = url;
    campaign.currentUi.artNeeded = false;
    campaign.artGenerationsThisChapter = Math.min(
      ART_GENERATIONS_PER_CHAPTER,
      campaign.artGenerationsThisChapter + 1,
    );
    campaign.updatedAt = new Date().toISOString();
    campaign.version += 1;
    return clone(campaign);
  }

  async getMemories(campaignId: string, limit: number): Promise<StoredMemory[]> {
    return clone((this.memories.get(campaignId) ?? []).slice(-limit));
  }

  async getSimilarMemories(
    campaignId: string,
    _queryVector: number[],
    limit: number,
  ): Promise<StoredMemory[]> {
    return this.getMemories(campaignId, limit);
  }

  async getFamilyPatterns(familyId: string, limit: number): Promise<StoredMemory[]> {
    return clone((this.patterns.get(familyId) ?? []).slice(-limit));
  }

  async saveFeedback(
    campaignId: string,
    player: AuthenticatedPlayer,
    feedback: ChapterFeedback,
  ): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;
    this.feedback.push({
      campaignId,
      playerId: player.id,
      chapterNumber: campaign.chapterNumber,
      ...feedback,
    });
    const chapterRatings = this.feedback.filter(
      (item) => item.campaignId === campaignId && item.chapterNumber === campaign.chapterNumber,
    );
    const positivePlayers = new Set(
      chapterRatings
        .filter((item) => item.rating === 'loved_it' || item.rating === 'okay')
        .map((item) => item.playerId),
    );
    if (positivePlayers.size === 2 && campaign.turnsInChapter >= 10) {
      const familyPatterns = this.patterns.get(campaign.familyId) ?? [];
      if (
        !familyPatterns.some(
          (item) => item.id === `pattern-${campaign.id}-${campaign.chapterNumber}`,
        )
      ) {
        familyPatterns.push(this.chapterPattern(campaign));
        this.patterns.set(campaign.familyId, familyPatterns);
      }
    }
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    this.campaigns.delete(campaignId);
    this.memories.delete(campaignId);
  }

  async findDueDeletions(_now: Date, _limit: number): Promise<string[]> {
    return [];
  }

  async purgeCampaignRecords(campaignId: string): Promise<void> {
    this.campaigns.delete(campaignId);
    this.memories.delete(campaignId);
    this.snapshots.forEach((_snapshot, key) => {
      if (key.startsWith(`${campaignId}:`)) this.snapshots.delete(key);
    });
  }

  private chapterPattern(campaign: CampaignState): StoredMemory {
    const rollTraits = [
      ...new Set(campaign.recentTurns.flatMap((turn) => turn.rolls.map((roll) => roll.trait))),
    ];
    return {
      id: `pattern-${campaign.id}-${campaign.chapterNumber}`,
      campaignId: campaign.id,
      familyId: campaign.familyId,
      chapterNumber: campaign.chapterNumber,
      turnId: `pattern-${campaign.id}-${campaign.chapterNumber}`,
      createdAt: new Date().toISOString(),
      kind: 'pattern',
      importance: 4,
      text: `A ${campaign.turnsInChapter}-turn chapter worked well with a ${campaign.world.mood.replace('_', ' ')} mood, ${rollTraits.join(', ') || 'roleplay'} challenges, ${campaign.world.characters.length} friendly NPC roles, and a ${campaign.currentUi.mood === 'triumph' ? 'celebratory rest' : 'gentle cliffhanger'} ending.`,
      embedding: null,
    };
  }
}
