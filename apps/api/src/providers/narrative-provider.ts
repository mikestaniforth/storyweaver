import type {
  CampaignState,
  CreateCampaignInput,
  GmBible,
  MemoryWrite,
  PlayerProfile,
  RollRecord,
  TurnResolution,
} from '@family-adventure/shared';

export interface NarrativeContext {
  campaign: CampaignState;
  actor: PlayerProfile;
  action: string;
  useSpecialMove: boolean;
  memories: MemoryWrite[];
  rollCheck: (params: {
    trait: 'might' | 'agility' | 'wits' | 'heart';
    difficulty: 'easy' | 'tricky' | 'hard';
    reason: string;
  }) => RollRecord;
}

export interface NarrativeProvider {
  readonly name: string;
  planCampaign(input: CreateCampaignInput): Promise<GmBible>;
  resolveTurn(context: NarrativeContext): Promise<TurnResolution>;
}
