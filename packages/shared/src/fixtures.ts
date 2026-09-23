import type {
  CampaignState,
  CreateCampaignInput,
  GmBible,
  PlayerProfile,
  ThemeToken,
} from './schemas.js';

function clip(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function openingTheme(title: string, premise: string): ThemeToken {
  const story = `${title} ${premise}`.toLowerCase();
  if (/\b(sky|cloud|floating|star|planet|space)\b/.test(story)) return 'sky_islands';
  if (/\b(cave|cavern|crystal|mine|underground)\b/.test(story)) return 'crystal_cavern';
  if (/\b(castle|fortress|king|queen|throne)\b/.test(story)) return 'stormy_castle';
  if (/\b(tavern|inn|feast|banquet)\b/.test(story)) return 'warm_tavern';
  if (/\b(village|town|farm|market)\b/.test(story)) return 'sunlit_village';
  if (/\b(forest|wood|tree|jungle)\b/.test(story)) return 'enchanted_forest';
  return 'moonlit_ruins';
}

export function demoPlayers(familyId = 'demo-family'): [PlayerProfile, PlayerProfile] {
  return [
    {
      id: 'demo-parent',
      familyId,
      role: 'parent',
      displayName: 'Dad',
      avatar: '🛡️',
      ageBand: 'adult',
      archetype: 'guardian',
      traits: { might: 2, agility: 0, wits: 1, heart: 3 },
      inventory: ['Moonlit compass', 'Travel cloak'],
      conditions: [],
      specialMove: 'Stand Together — turn a setback into a success with a complication.',
      specialMoveAvailable: true,
      chapterStars: 0,
    },
    {
      id: 'demo-child',
      familyId,
      role: 'child',
      displayName: 'Rowan',
      avatar: '🦊',
      ageBand: '8-12',
      archetype: 'scout',
      traits: { might: 0, agility: 3, wits: 2, heart: 1 },
      inventory: ['Pocket lantern', 'Silver chalk'],
      conditions: [],
      specialMove: 'Foxstep — slip through danger without making a roll.',
      specialMoveAvailable: true,
      chapterStars: 0,
    },
  ];
}

export function demoThirdPlayer(familyId = 'demo-family'): PlayerProfile {
  return {
    id: 'demo-wren',
    familyId,
    role: 'child',
    displayName: 'Wren',
    avatar: '🐉',
    ageBand: '8-12',
    archetype: 'inventor',
    traits: { might: 0, agility: 1, wits: 3, heart: 2 },
    inventory: ['Pocket lantern'],
    conditions: [],
    specialMove: 'Bright Idea — reveal a useful tool you prepared earlier.',
    specialMoveAvailable: true,
    chapterStars: 0,
  };
}

export function createDemoCampaign(
  id = 'demo-campaign',
  familyId = 'demo-family',
  title = 'The Lanterns of Everwood',
): CampaignState {
  const now = new Date().toISOString();
  const players = demoPlayers(familyId);
  return {
    id,
    familyId,
    title,
    status: 'lobby',
    createdAt: now,
    updatedAt: now,
    chapterNumber: 1,
    turnsInChapter: 0,
    totalTurns: 0,
    activePlayerId: null,
    playerOrder: players.map((player) => player.id),
    players,
    presence: {},
    world: {
      location: 'The Lantern Gate',
      locationDescription:
        'An ivy-covered arch marks the edge of Everwood, where tiny blue lanterns glow between ancient trees.',
      theme: 'enchanted_forest',
      mood: 'wonder',
      discoveredFacts: ['The forest lanterns have begun to disappear.'],
      quests: [
        {
          id: 'missing-lanterns',
          title: 'The Missing Lanterns',
          description: 'Discover why Everwood’s guiding lights are going dark.',
          status: 'active',
        },
      ],
      characters: [
        {
          id: 'pip',
          name: 'Pip Bramblewing',
          description: 'A tiny, brave moth-keeper wearing a coat stitched from autumn leaves.',
          avatar: '🦋',
          portraitUrl: null,
          relationship: 'A worried new friend who guards the Lantern Gate.',
        },
      ],
    },
    gmBible: {
      premise:
        'The magical lanterns that guide travellers through Everwood are vanishing one by one. Two family adventurers must follow the clues and restore their light.',
      secret:
        'A lonely cloud dragon has borrowed the lights to build a constellation for its lost family; it needs friendship, not defeat.',
      acts: [
        'Follow signs through the Lantern Gate and learn the forest’s rules.',
        'Cross the moonlit ruins and discover who is carrying the lights skyward.',
        'Reach the cloud garden and solve the loss with courage and kindness.',
      ],
      factions: ['The Lantern Keepers', 'The Mischief Crows', 'The Cloud Gardeners'],
      unresolvedThreats: ['Without lanterns, the safe paths through Everwood keep changing.'],
      possibleEndings: [
        'Create a new constellation while returning enough lanterns to guide travellers.',
        'Invite the cloud dragon to become Everwood’s first sky lantern keeper.',
      ],
    },
    contentSettings: {
      toneProfile: 'family_spooky',
      spookiness: 2,
      combatIntensity: 1,
      language: 'mild',
      permanentCharacterDeath: 'off',
    },
    currentUi: {
      theme: 'enchanted_forest',
      mood: 'wonder',
      ambientEffect: 'fireflies',
      timeOfDay: 'dusk',
      weather: 'clear',
      musicCue: 'wonder',
      musicIntensity: 1,
      visualMood: 'magical',
      artNeeded: true,
      artPrompt:
        'A 16-bit pixel-art fantasy forest gate at twilight, glowing blue lanterns, mysterious and adventurous, no people, wide cinematic landscape',
      sceneArtUrl: null,
      suggestions: [
        'Ask Pip which lantern vanished first',
        'Inspect the silver tracks beneath the arch',
        'Light the pocket lantern and enter together',
      ],
    },
    lastNarration:
      'Beyond the Lantern Gate, Everwood is holding its breath. Pip Bramblewing lifts a dim blue lantern and looks between you. “You came! I knew the forest would send someone brave.”',
    lastRolls: [],
    recentTurns: [],
    version: 1,
    artGenerationsThisChapter: 0,
  };
}

/**
 * Creates a real campaign without leaking any of the demo adventure's visible
 * world, characters, quests, narration, or atmosphere into the new story.
 */
export function createPlannedCampaign(
  id: string,
  familyId: string,
  input: CreateCampaignInput,
  players: PlayerProfile[],
  gmBible?: GmBible,
): CampaignState {
  const campaign = createDemoCampaign(id, familyId, input.title);
  const theme = openingTheme(input.title, input.premise);
  const spookiness = input.contentSettings.spookiness;
  const location = clip(`The Threshold of ${input.title}`, 100);
  const fact = clip(`The adventure begins with this truth: ${input.premise}`, 240);
  const questTitle = clip(`Begin ${input.title}`, 100);
  const playerNames = players.map((player) => player.displayName);

  campaign.players = structuredClone(players);
  campaign.playerOrder = players.map((player) => player.id);
  campaign.gmBible = {
    ...structuredClone(gmBible ?? campaign.gmBible),
    // The parent's premise is canonical even if a planning model paraphrases it.
    premise: input.premise,
  };
  campaign.contentSettings = structuredClone(input.contentSettings);
  campaign.world = {
    location,
    locationDescription: input.premise,
    theme,
    mood:
      spookiness >= 3
        ? 'dread'
        : spookiness === 2
          ? 'mystery_high'
          : spookiness === 1
            ? 'mystery_low'
            : 'wonder',
    discoveredFacts: [fact],
    quests: [
      {
        id: 'opening-mystery',
        title: questTitle,
        description: clip(input.premise, 300),
        status: 'active',
      },
    ],
    characters: [],
  };
  campaign.currentUi = {
    theme,
    mood: campaign.world.mood,
    ambientEffect:
      spookiness >= 3
        ? 'rain'
        : spookiness >= 1
          ? 'mist'
          : theme === 'warm_tavern'
            ? 'embers'
            : 'stars',
    timeOfDay: theme === 'crystal_cavern' ? 'underground' : spookiness >= 1 ? 'night' : 'dusk',
    weather: spookiness >= 3 ? 'storm' : spookiness >= 1 ? 'fog' : 'clear',
    musicCue: spookiness >= 3 ? 'tension' : spookiness >= 1 ? 'mystery' : 'wonder',
    musicIntensity: Math.max(1, spookiness),
    visualMood:
      spookiness >= 3
        ? 'ominous'
        : spookiness === 2
          ? 'eerie'
          : spookiness === 1
            ? 'curious'
            : 'magical',
    artNeeded: true,
    artPrompt: clip(
      `A wide 16-bit pixel-art opening scene for ${input.title}. ${input.premise} Strong silhouettes, atmospheric fantasy lighting, no text, no UI, no photorealism, no sexual content, no gore.`,
      700,
    ),
    sceneArtUrl: null,
    suggestions: [
      'Study the surroundings for the first clue',
      'Call out and see who or what answers',
      'Move carefully toward the source of the mystery',
    ],
  };
  campaign.lastNarration = `${joinNames(playerNames)}, your adventure begins.\n\n${input.premise}\n\nYou stand together at ${location}. Somewhere ahead, the first sign of the mystery is waiting—and the next choice belongs to you.`;
  campaign.lastRolls = [];
  campaign.recentTurns = [];
  campaign.artGenerationsThisChapter = 0;
  return campaign;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'Adventurers';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
