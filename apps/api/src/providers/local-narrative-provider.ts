import {
  chooseDifficultyForAction,
  chooseTraitForAction,
  nextPlayerId,
  type CreateCampaignInput,
  type GmBible,
  type MoodToken,
  type RollRecord,
  type ThemeToken,
  type TurnResolution,
} from '@family-adventure/shared';
import type { NarrativeContext, NarrativeProvider } from './narrative-provider.js';

const sceneProgression: Array<{
  theme: ThemeToken;
  mood: MoodToken;
  location: string;
  description: string;
  effect: TurnResolution['uiDirective']['ambientEffect'];
  timeOfDay: TurnResolution['uiDirective']['timeOfDay'];
  weather: TurnResolution['uiDirective']['weather'];
  musicCue: TurnResolution['uiDirective']['musicCue'];
  musicIntensity: TurnResolution['uiDirective']['musicIntensity'];
  visualMood: TurnResolution['uiDirective']['visualMood'];
}> = [
  {
    theme: 'enchanted_forest',
    mood: 'wonder',
    location: 'The Lantern Gate',
    description: 'Blue lanterns glow beneath an arch woven from ivy and silver branches.',
    effect: 'fireflies',
    timeOfDay: 'dusk',
    weather: 'clear',
    musicCue: 'wonder',
    musicIntensity: 1,
    visualMood: 'magical',
  },
  {
    theme: 'moonlit_ruins',
    mood: 'mystery_low',
    location: 'The Whispering Steps',
    description: 'Ancient stairs curl around a moonlit tower where painted stars slowly move.',
    effect: 'mist',
    timeOfDay: 'night',
    weather: 'fog',
    musicCue: 'mystery',
    musicIntensity: 2,
    visualMood: 'eerie',
  },
  {
    theme: 'crystal_cavern',
    mood: 'mystery_high',
    location: 'The Echoing Grotto',
    description: 'Crystals answer every kind word with a warm note and every footstep with light.',
    effect: 'stars',
    timeOfDay: 'underground',
    weather: 'clear',
    musicCue: 'tension',
    musicIntensity: 2,
    visualMood: 'ominous',
  },
  {
    theme: 'sky_islands',
    mood: 'triumph',
    location: 'The Cloud Garden',
    description: 'Floating islands drift above Everwood beneath a new, unfinished constellation.',
    effect: 'sunbeams',
    timeOfDay: 'dawn',
    weather: 'wind',
    musicCue: 'triumph',
    musicIntensity: 2,
    visualMood: 'victorious',
  },
];

const outcomeCopy: Record<RollRecord['outcome'], string> = {
  great_success: 'It works even better than you hoped.',
  success: 'Your plan works.',
  success_with_complication: 'It works, but the forest asks something in return.',
  setback: 'It does not work as planned, yet the mistake reveals a way forward.',
};

export class LocalNarrativeProvider implements NarrativeProvider {
  readonly name = 'local-storyteller';

  async planCampaign(input: CreateCampaignInput): Promise<GmBible> {
    return {
      premise: input.premise,
      secret:
        'The apparent troublemaker is protecting someone they love. The final challenge can be solved through courage, cleverness, or kindness.',
      acts: [
        'Meet a worried guide, establish the mystery, and discover the first impossible clue.',
        'Cross a changing magical place, make an unlikely friend, and learn the problem is not what it seemed.',
        'Reach the source, combine every hero’s strengths, and choose how the world changes next.',
      ],
      factions: ['The Lantern Keepers', 'The Wayward Wonders', 'The Quiet Guardians'],
      unresolvedThreats: ['A safe path is fading and will be lost unless the heroes act together.'],
      possibleEndings: [
        'Restore what was lost while giving the misunderstood rival a new purpose.',
        'Create a surprising new tradition that makes the world kinder than it was before.',
        'Protect the old magic and become its newest family of guardians.',
      ],
    };
  }

  async resolveTurn(context: NarrativeContext): Promise<TurnResolution> {
    const { campaign, actor, action } = context;
    const lower = action.toLowerCase();
    const needsRoll =
      !context.useSpecialMove && !/^(ask|say|tell|listen|look|wait|wave|thank|greet)\b/.test(lower);
    const roll = needsRoll
      ? context.rollCheck({
          trait: chooseTraitForAction(action),
          difficulty: chooseDifficultyForAction(action),
          reason: `Find out what happens when ${actor.displayName} tries to ${action.toLowerCase()}`,
        })
      : null;

    const step = Math.min(
      sceneProgression.length - 1,
      Math.floor((campaign.turnsInChapter + 1) / 3),
    );
    const scene = sceneProgression[step] as (typeof sceneProgression)[number];
    const actionSentence = action.replace(/[.!?]+$/, '');
    const resultSentence = context.useSpecialMove
      ? `${actor.specialMove.split('—')[0]?.trim() ?? 'Your special move'} shines at exactly the right moment. It works without a roll.`
      : roll
        ? `${outcomeCopy[roll.outcome]} The air gives a bright little chime around the ${roll.trait} you showed.`
        : 'The forest listens. A nearby lantern brightens, as though good conversation is a kind of magic here.';

    const turnBeat = campaign.turnsInChapter + 1;
    const revelation =
      turnBeat >= 8
        ? 'High above, a small cloud dragon places another borrowed lantern into the shape of a star. It looks lonely, not dangerous.'
        : turnBeat >= 5
          ? 'A silver feather drifts down from the clouds, carrying the reflection of a missing lantern.'
          : 'Pip’s antennae perk up as a trail of silver footprints appears between the roots.';

    const narration = `${actor.displayName} ${actionSentence.toLowerCase()}. ${resultSentence}\n\n${revelation}`;
    const complete = turnBeat >= 10;
    const locationChanged = scene.location !== campaign.world.location;

    return {
      narration,
      rolls: roll ? [roll] : [],
      worldPatch: {
        location: locationChanged ? scene.location : null,
        locationDescription: locationChanged ? scene.description : null,
        addFacts:
          turnBeat === 5
            ? ['The missing lanterns have been carried toward the clouds.']
            : turnBeat === 8
              ? ['A lonely cloud dragon is arranging the lanterns into a constellation.']
              : [],
        addInventory: turnBeat === 5 ? [{ playerId: actor.id, item: 'Silver cloud feather' }] : [],
        removeInventory: [],
        addConditions:
          roll?.outcome === 'setback' ? [{ playerId: actor.id, condition: 'Muddy boots' }] : [],
        clearConditions:
          roll?.outcome === 'great_success' && actor.conditions[0]
            ? [{ playerId: actor.id, condition: actor.conditions[0] }]
            : [],
      },
      questUpdates: complete
        ? [
            {
              questId: 'missing-lanterns',
              title: 'The Missing Lanterns',
              description: 'Reach the Cloud Garden and decide how to share the lantern light.',
              status: 'active',
            },
          ]
        : [],
      memoryWrites: [
        {
          kind: 'fact',
          text: `${actor.displayName} chose to ${actionSentence.toLowerCase()}. ${resultSentence}`,
          importance: roll ? 3 : 2,
        },
      ],
      uiDirective: {
        theme: scene.theme,
        mood: scene.mood,
        ambientEffect: scene.effect,
        timeOfDay: scene.timeOfDay,
        weather: scene.weather,
        musicCue: scene.musicCue,
        musicIntensity: scene.musicIntensity,
        visualMood: scene.visualMood,
        artNeeded: locationChanged,
        artPrompt: locationChanged
          ? `Cinematic 16-bit pixel-art fantasy scene of ${scene.location}: ${scene.description} Restrained colour palette, strong silhouettes, no people, no text, no UI, wide landscape.`
          : null,
        sceneArtUrl: campaign.currentUi.sceneArtUrl,
        suggestions: complete
          ? [
              'Offer to help finish the constellation',
              'Ask the dragon to become a lantern keeper',
              'Find a way to share every lantern',
            ]
          : [
              'Follow the silver footprints together',
              'Ask Pip what the lanterns remember',
              'Use an item from your pack in a clever way',
            ],
      },
      featuredCharacterIds: ['pip'],
      chapterStatus: complete
        ? {
            state: 'complete',
            recap:
              'Together you followed the missing light from the Lantern Gate to the edge of the Cloud Garden.',
            cliffhanger: 'A cloud dragon turns, holding the final lantern between its paws.',
          }
        : { state: 'continue', recap: null, cliffhanger: null },
      nextPlayerId: nextPlayerId(campaign, actor.id),
    };
  }
}
