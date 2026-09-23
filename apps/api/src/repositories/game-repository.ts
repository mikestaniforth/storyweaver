import type {
  AuthenticatedPlayer,
  CampaignState,
  ChapterFeedback,
  ContentSettings,
  CreateCampaignInput,
  GmBible,
  MemoryWrite,
  PlayerProfile,
  TurnRecord,
} from '@family-adventure/shared';

export interface FamilyRecord {
  id: string;
  parentUid: string;
  familyCode: string;
  familyCodeHash: string;
  pinSalt: string | null;
  pinHash: string | null;
  failedPinAttempts: number;
  lockedUntil: string | null;
  childProfileId: string | null;
  childProfileIds?: string[];
  createdAt: string;
}

export interface StoredMemory extends MemoryWrite {
  id: string;
  campaignId: string;
  familyId: string;
  chapterNumber: number;
  turnId: string;
  createdAt: string;
  embedding: number[] | null;
}

export interface BootstrapData {
  family: Pick<FamilyRecord, 'id' | 'familyCode' | 'childProfileId'> & {
    childProfileIds: string[];
  };
  profiles: PlayerProfile[];
}

export interface ChildCredential {
  family: FamilyRecord;
  profile: PlayerProfile;
}

export interface CreateChildInput {
  displayName: string;
  avatar: string;
  archetype: PlayerProfile['archetype'];
  pinSalt: string | null;
  pinHash: string | null;
}

export interface GameRepository {
  getProfile(playerId: string): Promise<PlayerProfile | null>;
  getFamilyProfiles(familyId: string): Promise<PlayerProfile[]>;
  bootstrapParent(uid: string, displayName: string): Promise<BootstrapData>;
  createChildProfile(parent: AuthenticatedPlayer, input: CreateChildInput): Promise<BootstrapData>;
  rotateFamilyCode(parent: AuthenticatedPlayer): Promise<BootstrapData>;
  findChildCredential(
    familyCodeHash: string,
    adventurerName?: string,
  ): Promise<ChildCredential | null>;
  recordPinAttempt(familyId: string, success: boolean): Promise<void>;
  listCampaigns(familyId: string): Promise<CampaignState[]>;
  getCampaign(campaignId: string): Promise<CampaignState | null>;
  getTurn(turnId: string): Promise<TurnRecord | null>;
  listTurns(campaignId: string): Promise<TurnRecord[]>;
  createCampaign(
    familyId: string,
    input: CreateCampaignInput,
    players: PlayerProfile[],
    gmBible?: GmBible,
  ): Promise<CampaignState>;
  updatePresence(
    campaignId: string,
    playerId: string,
    sessionId: string,
    now: Date,
  ): Promise<CampaignState>;
  updateContentSettings(campaignId: string, settings: ContentSettings): Promise<CampaignState>;
  consumeDailyQuota(familyId: string, kind: 'story' | 'media', limit: number): Promise<boolean>;
  claimAction(
    campaignId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<boolean>;
  releaseAction(campaignId: string, expectedVersion: number, idempotencyKey: string): Promise<void>;
  claimSceneArt(campaignId: string): Promise<CampaignState | null>;
  releaseSceneArt(campaignId: string, chapterNumber: number): Promise<void>;
  commitTransition(params: {
    previous: CampaignState;
    next: CampaignState;
    turn?: TurnRecord;
    memories?: StoredMemory[];
  }): Promise<CampaignState>;
  rewind(campaignId: string): Promise<CampaignState>;
  setSceneArt(campaignId: string, chapterNumber: number, url: string): Promise<CampaignState>;
  getMemories(campaignId: string, limit: number): Promise<StoredMemory[]>;
  getSimilarMemories(
    campaignId: string,
    queryVector: number[],
    limit: number,
  ): Promise<StoredMemory[]>;
  getFamilyPatterns(familyId: string, limit: number): Promise<StoredMemory[]>;
  saveFeedback(
    campaignId: string,
    player: AuthenticatedPlayer,
    feedback: ChapterFeedback,
  ): Promise<void>;
  deleteCampaign(campaignId: string): Promise<void>;
  findDueDeletions(now: Date, limit: number): Promise<string[]>;
  purgeCampaignRecords(campaignId: string): Promise<void>;
}
