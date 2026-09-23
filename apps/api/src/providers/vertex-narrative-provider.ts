import {
  ContentSettingsSchema,
  GmBibleSchema,
  TurnResolutionSchema,
  nextPlayerId,
  type CreateCampaignInput,
  type GmBible,
  type RollRecord,
  type TurnResolution,
} from '@family-adventure/shared';
import type { AppConfig } from '../config.js';
import { googleJsonRequest } from '../services/google-access.js';
import type { NarrativeContext, NarrativeProvider } from './narrative-provider.js';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{ content?: GeminiContent; finishReason?: string }>;
}

const gmBibleJsonSchema = {
  type: 'OBJECT',
  required: ['premise', 'secret', 'acts', 'factions', 'unresolvedThreats', 'possibleEndings'],
  properties: {
    premise: { type: 'STRING', minLength: 1, maxLength: 1000 },
    secret: { type: 'STRING', minLength: 1, maxLength: 500 },
    acts: {
      type: 'ARRAY',
      minItems: 3,
      maxItems: 3,
      items: { type: 'STRING', minLength: 1, maxLength: 500 },
    },
    factions: {
      type: 'ARRAY',
      maxItems: 8,
      items: { type: 'STRING', minLength: 1, maxLength: 200 },
    },
    unresolvedThreats: {
      type: 'ARRAY',
      maxItems: 12,
      items: { type: 'STRING', minLength: 1, maxLength: 300 },
    },
    possibleEndings: {
      type: 'ARRAY',
      minItems: 2,
      maxItems: 6,
      items: { type: 'STRING', minLength: 1, maxLength: 400 },
    },
  },
};

const turnResolutionJsonSchema = {
  type: 'OBJECT',
  required: [
    'narration',
    'rolls',
    'worldPatch',
    'questUpdates',
    'memoryWrites',
    'uiDirective',
    'featuredCharacterIds',
    'chapterStatus',
    'nextPlayerId',
  ],
  properties: {
    narration: { type: 'STRING' },
    rolls: { type: 'ARRAY', items: { type: 'OBJECT' } },
    worldPatch: {
      type: 'OBJECT',
      required: [
        'location',
        'locationDescription',
        'addFacts',
        'addInventory',
        'removeInventory',
        'addConditions',
        'clearConditions',
      ],
      properties: {
        location: { type: 'STRING', nullable: true },
        locationDescription: { type: 'STRING', nullable: true },
        addFacts: { type: 'ARRAY', items: { type: 'STRING' } },
        addInventory: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['playerId', 'item'],
            properties: { playerId: { type: 'STRING' }, item: { type: 'STRING' } },
          },
        },
        removeInventory: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['playerId', 'item'],
            properties: { playerId: { type: 'STRING' }, item: { type: 'STRING' } },
          },
        },
        addConditions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['playerId', 'condition'],
            properties: { playerId: { type: 'STRING' }, condition: { type: 'STRING' } },
          },
        },
        clearConditions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['playerId', 'condition'],
            properties: { playerId: { type: 'STRING' }, condition: { type: 'STRING' } },
          },
        },
      },
    },
    questUpdates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['questId', 'title', 'description', 'status'],
        properties: {
          questId: { type: 'STRING' },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          status: { type: 'STRING', enum: ['active', 'completed', 'failed'] },
        },
      },
    },
    memoryWrites: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['kind', 'text', 'importance'],
        properties: {
          kind: {
            type: 'STRING',
            enum: ['fact', 'relationship', 'promise', 'chapter_summary', 'pattern'],
          },
          text: { type: 'STRING' },
          importance: { type: 'INTEGER', minimum: 1, maximum: 5 },
        },
      },
    },
    uiDirective: {
      type: 'OBJECT',
      required: [
        'theme',
        'mood',
        'ambientEffect',
        'timeOfDay',
        'weather',
        'musicCue',
        'musicIntensity',
        'visualMood',
        'artNeeded',
        'artPrompt',
        'sceneArtUrl',
        'suggestions',
      ],
      properties: {
        theme: {
          type: 'STRING',
          enum: [
            'enchanted_forest',
            'stormy_castle',
            'warm_tavern',
            'moonlit_ruins',
            'crystal_cavern',
            'sunlit_village',
            'sky_islands',
          ],
        },
        mood: {
          type: 'STRING',
          enum: [
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
          ],
        },
        ambientEffect: {
          type: 'STRING',
          enum: ['fireflies', 'rain', 'embers', 'mist', 'stars', 'sunbeams', 'none'],
        },
        timeOfDay: {
          type: 'STRING',
          enum: ['dawn', 'day', 'dusk', 'night', 'underground', 'timeless'],
        },
        weather: {
          type: 'STRING',
          enum: ['clear', 'rain', 'fog', 'snow', 'storm', 'wind'],
        },
        musicCue: {
          type: 'STRING',
          enum: [
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
          ],
        },
        musicIntensity: { type: 'INTEGER', minimum: 0, maximum: 3 },
        visualMood: {
          type: 'STRING',
          enum: ['serene', 'curious', 'eerie', 'ominous', 'urgent', 'magical', 'victorious'],
        },
        artNeeded: { type: 'BOOLEAN' },
        artPrompt: { type: 'STRING', nullable: true },
        sceneArtUrl: { type: 'STRING', nullable: true },
        suggestions: { type: 'ARRAY', minItems: 2, maxItems: 3, items: { type: 'STRING' } },
      },
    },
    featuredCharacterIds: { type: 'ARRAY', items: { type: 'STRING' } },
    chapterStatus: {
      type: 'OBJECT',
      required: ['state', 'recap', 'cliffhanger'],
      properties: {
        state: { type: 'STRING', enum: ['continue', 'complete'] },
        recap: { type: 'STRING', nullable: true },
        cliffhanger: { type: 'STRING', nullable: true },
      },
    },
    nextPlayerId: { type: 'STRING' },
  },
};

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function clippedString(value: unknown, maxLength: number): unknown {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : value;
}

function clippedStringArray(value: unknown, maxItems: number, maxLength: number): unknown {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => clippedString(item, maxLength))
    : value;
}

export function normalizeGmBibleCandidate(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
    premise: clippedString(candidate.premise, 1000),
    secret: clippedString(candidate.secret, 500),
    acts: clippedStringArray(candidate.acts, 3, 500),
    factions: clippedStringArray(candidate.factions, 8, 200),
    unresolvedThreats: clippedStringArray(candidate.unresolvedThreats, 12, 300),
    possibleEndings: clippedStringArray(candidate.possibleEndings, 6, 400),
  };
}

export class VertexNarrativeProvider implements NarrativeProvider {
  readonly name = 'vertex-gemini';

  constructor(private readonly config: AppConfig) {
    if (!config.googleCloudProject) {
      throw new Error('GOOGLE_CLOUD_PROJECT is required for the Vertex narrative provider.');
    }
  }

  async planCampaign(input: CreateCampaignInput): Promise<GmBible> {
    const prompt = `Create a private rules-light supernatural fantasy campaign bible for ${input.playerIds?.length ?? 2} equal family adventurers.

Premise supplied by the parent: ${input.premise}
Title: ${input.title}
Maximum spookiness: ${input.contentSettings.spookiness}/3
Maximum combat intensity: ${input.contentSettings.combatIntensity}/2
Language: ${input.contentSettings.language}
Permanent character death: ${input.contentSettings.permanentCharacterDeath}

Use a Family Spooky tone: sustained suspense, eerie creatures, unsettling mysteries, chases, supernatural effects, non-graphic injuries, and meaningful danger are welcome when the spookiness setting allows them. Make the apparent rival understandable rather than simply evil. Support cleverness, courage, kindness, and several endings. Do not use D&D settings, characters, trademarks, or published adventures. Never include sexual or sexualised content, graphic gore or torture, strong profanity or slurs, self-harm detail, grooming, cruelty to children, or emotionally dependent AI behaviour.`;
    const text = await this.generateText(
      this.config.planningModel,
      [{ role: 'user', parts: [{ text: prompt }] }],
      gmBibleJsonSchema,
    );
    return GmBibleSchema.parse(normalizeGmBibleCandidate(JSON.parse(stripCodeFence(text))));
  }

  async resolveTurn(context: NarrativeContext): Promise<TurnResolution> {
    const deadline = Date.now() + 36_000;
    const executedRolls: RollRecord[] = [];
    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [
          {
            text: this.turnPrompt(context),
          },
        ],
      },
    ];

    let rawText = '';
    for (let loop = 0; loop < 3; loop += 1) {
      const response = await this.generate(
        this.config.narrativeModel,
        contents,
        true,
        turnResolutionJsonSchema,
        this.remaining(deadline, 16_000),
      );
      const content = response.candidates?.[0]?.content;
      if (!content) throw new Error('Gemini returned no candidate content.');
      const calls = content.parts.filter((part) => part.functionCall);
      if (calls.length === 0) {
        rawText = content.parts.map((part) => part.text ?? '').join('');
        break;
      }

      contents.push(content);
      const responseParts: GeminiPart[] = [];
      for (const part of calls) {
        const call = part.functionCall as NonNullable<GeminiPart['functionCall']>;
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: this.executeTool(call.name, call.args ?? {}, context, executedRolls),
          },
        });
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    try {
      return this.parseResolution(rawText, context, executedRolls);
    } catch (firstError) {
      const repaired = await this.repairResolution(rawText, context, executedRolls, deadline);
      try {
        return repaired;
      } catch {
        throw firstError;
      }
    }
  }

  private turnPrompt(context: NarrativeContext): string {
    const { campaign, actor, action } = context;
    const settings = ContentSettingsSchema.parse(campaign.contentSettings);
    const players = campaign.players.map((player) => ({
      id: player.id,
      role: player.role,
      displayName: player.displayName,
      archetype: player.archetype,
      traits: player.traits,
      inventory: player.inventory,
      conditions: player.conditions,
      specialMove: player.specialMove,
      specialMoveAvailable: player.specialMoveAvailable,
    }));
    return `You are the warm, fair Game Master of a private Family Spooky supernatural fantasy adventure.

Success means:
- respond to the player's exact action and preserve their agency
- use roll_check only when the outcome is meaningfully risky or uncertain
- accept setbacks but always reveal a constructive way forward
- update only facts justified by the narrated events
- give the next adventurer in the rotation the next turn
- target a chapter ending between player actions 10 and 14
- direct the atmosphere with timeOfDay, weather, visualMood, musicCue, and musicIntensity tokens that match this exact beat
- do not request new artwork during turns; the server creates exactly one image at each chapter opening
- return the required JSON schema and no prose outside it

TONE CONTROLS:
- spookiness ${settings.spookiness}/3 (${['cosy mystery', 'mysterious', 'spooky', 'intense supernatural suspense'][settings.spookiness]})
- action ${settings.combatIntensity}/2
- language ${settings.language}; ${settings.language === 'clean' ? 'use no profanity' : 'occasional mild exclamations are acceptable, but never strong profanity'}
- permanent character death ${settings.permanentCharacterDeath}; ${settings.permanentCharacterDeath === 'off' ? 'use temporary defeat, rescue, escape, or lasting story consequences instead' : 'only use it as an earned story event and never arbitrarily'}

Family Spooky permits sustained tension, eerie monsters, disappearances, chases, unsettling mysteries, supernatural influence, non-graphic injuries, and meaningful peril up to the selected intensity. Hard boundaries: no sexual or sexualised content, graphic gore or torture, strong profanity or slurs, self-harm detail, grooming, hateful content, cruelty to children, real-world dangerous instructions, requests for personal information, or emotionally dependent AI behaviour. The Game Master is a narrator, never a confidant or replacement friend.

CAMPAIGN BIBLE (secret from players):
${JSON.stringify(campaign.gmBible)}

CANONICAL WORLD:
${JSON.stringify(campaign.world)}

PLAYERS:
${JSON.stringify(players)}

CHAPTER: ${campaign.chapterNumber}; completed player actions this chapter: ${campaign.turnsInChapter}
RECENT TURNS:
${JSON.stringify(campaign.recentTurns.slice(-8))}

RELEVANT MEMORIES:
${JSON.stringify(context.memories)}

ACTIVE PLAYER: ${actor.displayName} (${actor.id})
PLAYER ACTION: ${action}
SPECIAL MOVE ACTIVE: ${context.useSpecialMove ? actor.specialMove : 'no'}
NEXT PLAYER MUST BE: ${nextPlayerId(campaign, actor.id)}

For artPrompt, describe a cinematic 16-bit pixel-art fantasy scene with a restrained palette, strong silhouettes, no text, no UI, no photoreal people, no sexual content, and no gore. Keep recurring characters visually consistent with their canonical descriptions. Keep narration to 2–5 short paragraphs.`;
  }

  private executeTool(
    name: string,
    args: Record<string, unknown>,
    context: NarrativeContext,
    rolls: RollRecord[],
  ): unknown {
    if (name === 'roll_check') {
      if (context.useSpecialMove) {
        return {
          automaticSuccess: true,
          reason: `${context.actor.displayName} used ${context.actor.specialMove}. Resolve without a roll.`,
        };
      }
      const trait = String(args.trait) as 'might' | 'agility' | 'wits' | 'heart';
      const difficulty = String(args.difficulty) as 'easy' | 'tricky' | 'hard';
      const reason = String(args.reason ?? 'Resolve a risky action');
      const roll = context.rollCheck({ trait, difficulty, reason });
      rolls.push(roll);
      return roll;
    }
    if (name === 'read_entity') {
      return (
        context.campaign.world.characters.find((entity) => entity.id === args.entityId) ?? {
          error: 'not_found',
        }
      );
    }
    if (name === 'search_memory') return context.memories;
    if (name === 'inspect_inventory') {
      return (
        context.campaign.players.find((player) => player.id === args.playerId)?.inventory ?? []
      );
    }
    return { error: 'unknown_tool' };
  }

  private parseResolution(
    text: string,
    context: NarrativeContext,
    rolls: RollRecord[],
  ): TurnResolution {
    if (!text) throw new Error('Gemini returned no structured turn resolution.');
    const parsed = JSON.parse(stripCodeFence(text)) as Record<string, unknown>;
    const proposedUi = parsed.uiDirective as Record<string, unknown> | undefined;
    return TurnResolutionSchema.parse({
      ...parsed,
      rolls,
      nextPlayerId: nextPlayerId(context.campaign, context.actor.id),
      uiDirective: {
        ...proposedUi,
        // Generated URLs are never trusted. Only the media worker may attach art.
        sceneArtUrl: proposedUi?.artNeeded === true ? null : context.campaign.currentUi.sceneArtUrl,
      },
    });
  }

  private async repairResolution(
    invalidText: string,
    context: NarrativeContext,
    rolls: RollRecord[],
    deadline: number,
  ): Promise<TurnResolution> {
    const prompt = `${this.turnPrompt(context)}

The first response was invalid. Repair it without changing the outcome or inventing rolls.
SERVER ROLLS: ${JSON.stringify(rolls)}
INVALID RESPONSE: ${invalidText.slice(0, 8000)}`;
    const text = await this.generateText(
      this.config.planningModel,
      [{ role: 'user', parts: [{ text: prompt }] }],
      turnResolutionJsonSchema,
      this.remaining(deadline, 16_000),
    );
    return this.parseResolution(text, context, rolls);
  }

  private async generateText(
    model: string,
    contents: GeminiContent[],
    responseSchema: unknown,
    timeoutMs = 40_000,
  ): Promise<string> {
    const response = await this.generate(model, contents, false, responseSchema, timeoutMs);
    return response.candidates?.[0]?.content?.parts.map((part) => part.text ?? '').join('') ?? '';
  }

  private async generate(
    model: string,
    contents: GeminiContent[],
    withTools: boolean,
    responseSchema: unknown = turnResolutionJsonSchema,
    timeoutMs = 40_000,
  ): Promise<GeminiResponse> {
    const project = this.config.googleCloudProject as string;
    const location = this.config.vertexLocation;
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    return googleJsonRequest<GeminiResponse>(
      url,
      {
        contents,
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 4096,
          thinkingConfig: {
            thinkingBudget: model === this.config.planningModel ? 512 : 0,
          },
          responseMimeType: 'application/json',
          responseSchema,
        },
        ...(withTools
          ? {
              tools: [
                {
                  functionDeclarations: [
                    {
                      name: 'roll_check',
                      description:
                        'Ask the trusted rules engine to roll when an action is risky or uncertain.',
                      parameters: {
                        type: 'OBJECT',
                        required: ['trait', 'difficulty', 'reason'],
                        properties: {
                          trait: {
                            type: 'STRING',
                            enum: ['might', 'agility', 'wits', 'heart'],
                          },
                          difficulty: { type: 'STRING', enum: ['easy', 'tricky', 'hard'] },
                          reason: { type: 'STRING' },
                        },
                      },
                    },
                    {
                      name: 'read_entity',
                      description: 'Read the canonical record for an NPC already in the world.',
                      parameters: {
                        type: 'OBJECT',
                        required: ['entityId'],
                        properties: { entityId: { type: 'STRING' } },
                      },
                    },
                    {
                      name: 'search_memory',
                      description: 'Retrieve relevant established memories for continuity.',
                      parameters: {
                        type: 'OBJECT',
                        required: ['query'],
                        properties: { query: { type: 'STRING' } },
                      },
                    },
                    {
                      name: 'inspect_inventory',
                      description: 'Read a player’s canonical inventory.',
                      parameters: {
                        type: 'OBJECT',
                        required: ['playerId'],
                        properties: { playerId: { type: 'STRING' } },
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      timeoutMs,
    );
  }

  private remaining(deadline: number, perCallCap: number): number {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) throw new Error('Narrative generation timed out safely.');
    return Math.min(perCallCap, remaining);
  }
}
