import { z } from 'zod';

export const PlayerRoleSchema = z.enum(['parent', 'child']);
export type PlayerRole = z.infer<typeof PlayerRoleSchema>;

export const TraitNameSchema = z.enum(['might', 'agility', 'wits', 'heart']);
export type TraitName = z.infer<typeof TraitNameSchema>;

export const DifficultySchema = z.enum(['easy', 'tricky', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const RollOutcomeSchema = z.enum([
  'great_success',
  'success',
  'success_with_complication',
  'setback',
]);
export type RollOutcome = z.infer<typeof RollOutcomeSchema>;

export const ThemeTokenSchema = z.enum([
  'enchanted_forest',
  'stormy_castle',
  'warm_tavern',
  'moonlit_ruins',
  'crystal_cavern',
  'sunlit_village',
  'sky_islands',
]);
export type ThemeToken = z.infer<typeof ThemeTokenSchema>;

export const MoodTokenSchema = z.enum([
  'wonder',
  'mystery_low',
  'mystery_high',
  'dread',
  'peril_high',
  'chase',
  'reveal',
  'triumph',
  'cosy',
  'peril_mild',
]);
export type MoodToken = z.infer<typeof MoodTokenSchema>;

export const TimeOfDaySchema = z.enum(['dawn', 'day', 'dusk', 'night', 'underground', 'timeless']);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const WeatherTokenSchema = z.enum(['clear', 'rain', 'fog', 'snow', 'storm', 'wind']);
export type WeatherToken = z.infer<typeof WeatherTokenSchema>;

export const MusicCueSchema = z.enum([
  'silence',
  'exploration',
  'wonder',
  'mystery',
  'tension',
  'chase',
  'reveal',
  'rest',
  'triumph',
  'sorrow',
]);
export type MusicCue = z.infer<typeof MusicCueSchema>;

export const VisualMoodSchema = z.enum([
  'serene',
  'curious',
  'eerie',
  'ominous',
  'urgent',
  'magical',
  'victorious',
]);
export type VisualMood = z.infer<typeof VisualMoodSchema>;

export const PlayerProfileSchema = z.object({
  id: z.string().min(1),
  familyId: z.string().min(1),
  role: PlayerRoleSchema,
  displayName: z.string().min(1).max(30),
  avatar: z.string().min(1).max(8),
  ageBand: z.enum(['adult', '8-12']),
  archetype: z.enum(['guardian', 'scout', 'inventor', 'storykeeper']),
  traits: z.object({
    might: z.number().int().min(0).max(3),
    agility: z.number().int().min(0).max(3),
    wits: z.number().int().min(0).max(3),
    heart: z.number().int().min(0).max(3),
  }),
  inventory: z.array(z.string().min(1).max(80)).max(20),
  conditions: z.array(z.string().min(1).max(80)).max(3),
  specialMove: z.string().min(1).max(120),
  specialMoveAvailable: z.boolean(),
  chapterStars: z.number().int().min(0),
});
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

export const PresenceSchema = z.object({
  playerId: z.string(),
  lastSeenAt: z.string().datetime(),
  sessionId: z.string().min(1).max(100),
});
export type Presence = z.infer<typeof PresenceSchema>;

export const RollRecordSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  trait: TraitNameSchema,
  difficulty: DifficultySchema,
  dc: z.number().int(),
  die: z.number().int().min(1).max(20),
  modifier: z.number().int().min(0).max(3),
  total: z.number().int(),
  outcome: RollOutcomeSchema,
  reason: z.string().min(1).max(180),
});
export type RollRecord = z.infer<typeof RollRecordSchema>;

export const QuestSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  status: z.enum(['active', 'completed', 'failed']),
});
export type Quest = z.infer<typeof QuestSchema>;

export const CharacterEntitySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  avatar: z.string().min(1).max(8),
  portraitUrl: z.string().url().nullable(),
  relationship: z.string().min(1).max(120),
});
export type CharacterEntity = z.infer<typeof CharacterEntitySchema>;

export const WorldStateSchema = z.object({
  location: z.string().min(1).max(100),
  locationDescription: z.string().min(1).max(500),
  theme: ThemeTokenSchema,
  mood: MoodTokenSchema,
  discoveredFacts: z.array(z.string().min(1).max(240)).max(100),
  quests: z.array(QuestSchema).max(20),
  characters: z.array(CharacterEntitySchema).max(30),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

export const GmBibleSchema = z.object({
  premise: z.string().min(1).max(1000),
  secret: z.string().min(1).max(500),
  acts: z.array(z.string().min(1).max(500)).length(3),
  factions: z.array(z.string().min(1).max(200)).max(8),
  unresolvedThreats: z.array(z.string().min(1).max(300)).max(12),
  possibleEndings: z.array(z.string().min(1).max(400)).min(2).max(6),
});
export type GmBible = z.infer<typeof GmBibleSchema>;

export const UiDirectiveSchema = z.object({
  theme: ThemeTokenSchema,
  mood: MoodTokenSchema,
  ambientEffect: z.enum(['fireflies', 'rain', 'embers', 'mist', 'stars', 'sunbeams', 'none']),
  timeOfDay: TimeOfDaySchema.default('dusk'),
  weather: WeatherTokenSchema.default('clear'),
  musicCue: MusicCueSchema.default('exploration'),
  musicIntensity: z.number().int().min(0).max(3).default(1),
  visualMood: VisualMoodSchema.default('curious'),
  artNeeded: z.boolean(),
  artPrompt: z.string().max(700).nullable(),
  sceneArtUrl: z.string().url().nullable(),
  suggestions: z.array(z.string().min(1).max(140)).min(2).max(3),
});
export type UiDirective = z.infer<typeof UiDirectiveSchema>;

export const WorldPatchSchema = z.object({
  location: z.string().min(1).max(100).nullable(),
  locationDescription: z.string().min(1).max(500).nullable(),
  addFacts: z.array(z.string().min(1).max(240)).max(5),
  addInventory: z.array(z.object({ playerId: z.string(), item: z.string().min(1).max(80) })).max(4),
  removeInventory: z
    .array(z.object({ playerId: z.string(), item: z.string().min(1).max(80) }))
    .max(4),
  addConditions: z
    .array(z.object({ playerId: z.string(), condition: z.string().min(1).max(80) }))
    .max(2),
  clearConditions: z
    .array(z.object({ playerId: z.string(), condition: z.string().min(1).max(80) }))
    .max(3),
});
export type WorldPatch = z.infer<typeof WorldPatchSchema>;

export const QuestUpdateSchema = z.object({
  questId: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  status: z.enum(['active', 'completed', 'failed']),
});
export type QuestUpdate = z.infer<typeof QuestUpdateSchema>;

export const MemoryWriteSchema = z.object({
  kind: z.enum(['fact', 'relationship', 'promise', 'chapter_summary', 'pattern']),
  text: z.string().min(1).max(500),
  importance: z.number().int().min(1).max(5),
});
export type MemoryWrite = z.infer<typeof MemoryWriteSchema>;

export const ChapterStatusSchema = z.object({
  state: z.enum(['continue', 'complete']),
  recap: z.string().max(800).nullable(),
  cliffhanger: z.string().max(300).nullable(),
});
export type ChapterStatus = z.infer<typeof ChapterStatusSchema>;

export const TurnResolutionSchema = z.object({
  narration: z.string().min(1).max(2400),
  rolls: z.array(RollRecordSchema).max(3),
  worldPatch: WorldPatchSchema,
  questUpdates: z.array(QuestUpdateSchema).max(4),
  memoryWrites: z.array(MemoryWriteSchema).max(5),
  uiDirective: UiDirectiveSchema,
  featuredCharacterIds: z.array(z.string()).max(4),
  chapterStatus: ChapterStatusSchema,
  nextPlayerId: z.string(),
});
export type TurnResolution = z.infer<typeof TurnResolutionSchema>;

export const TurnRecordSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  chapterNumber: z.number().int().min(1),
  turnNumber: z.number().int().min(1),
  playerId: z.string(),
  playerAction: z.string().min(1).max(600),
  narration: z.string().min(1).max(2400),
  rolls: z.array(RollRecordSchema),
  uiDirective: UiDirectiveSchema,
  createdAt: z.string().datetime(),
  idempotencyKey: z.string().min(1).max(120),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

export const CampaignStatusSchema = z.enum(['lobby', 'active', 'chapter_complete', 'archived']);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const ContentSettingsSchema = z.object({
  toneProfile: z.literal('family_spooky').default('family_spooky'),
  spookiness: z.number().int().min(0).max(3),
  combatIntensity: z.number().int().min(0).max(2),
  language: z.enum(['clean', 'mild']).default('mild'),
  permanentCharacterDeath: z.enum(['off', 'story_only']).default('off'),
});
export type ContentSettings = z.infer<typeof ContentSettingsSchema>;

export const CampaignStateSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  title: z.string().min(1).max(100),
  status: CampaignStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  chapterNumber: z.number().int().min(1),
  turnsInChapter: z.number().int().min(0).max(14),
  totalTurns: z.number().int().min(0),
  activePlayerId: z.string().nullable(),
  playerOrder: z.array(z.string()).min(2).max(3),
  players: z.array(PlayerProfileSchema).min(2).max(3),
  presence: z.record(z.string(), PresenceSchema),
  world: WorldStateSchema,
  gmBible: GmBibleSchema,
  contentSettings: ContentSettingsSchema,
  currentUi: UiDirectiveSchema,
  lastNarration: z.string().max(2400),
  lastRolls: z.array(RollRecordSchema).max(3),
  recentTurns: z.array(TurnRecordSchema).max(30),
  version: z.number().int().min(1),
  artGenerationsThisChapter: z.number().int().min(0).max(3),
});
export type CampaignState = z.infer<typeof CampaignStateSchema>;

export const CampaignViewSchema = CampaignStateSchema.omit({ gmBible: true });
export type CampaignView = z.infer<typeof CampaignViewSchema>;

export const CreateCampaignInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  premise: z.string().trim().min(10).max(500),
  playerIds: z.array(z.string().min(1)).min(2).max(3).optional(),
  contentSettings: ContentSettingsSchema.default({
    toneProfile: 'family_spooky',
    spookiness: 2,
    combatIntensity: 1,
    language: 'mild',
    permanentCharacterDeath: 'off',
  }),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const ActionInputSchema = z.object({
  action: z.string().trim().min(1).max(600),
  idempotencyKey: z.string().min(8).max(120),
  useSpecialMove: z.boolean().default(false),
});
export type ActionInput = z.infer<typeof ActionInputSchema>;

export const PresenceInputSchema = z.object({
  sessionId: z.string().min(8).max(100),
});
export type PresenceInput = z.infer<typeof PresenceInputSchema>;

export const ChildSessionInputSchema = z.object({
  familyCode: z.string().trim().min(6).max(20),
  pin: z.string().regex(/^\d{4,8}$/),
  adventurerName: z.string().trim().min(1).max(30).optional(),
});
export type ChildSessionInput = z.infer<typeof ChildSessionInputSchema>;

export const ChapterFeedbackSchema = z.object({
  rating: z.enum(['loved_it', 'okay', 'not_for_us']),
});
export type ChapterFeedback = z.infer<typeof ChapterFeedbackSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export type AuthenticatedPlayer = Pick<PlayerProfile, 'id' | 'familyId' | 'role' | 'displayName'>;
