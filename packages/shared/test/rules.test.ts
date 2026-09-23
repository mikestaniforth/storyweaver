import { describe, expect, it } from 'vitest';
import {
  createDemoCampaign,
  createPlannedCampaign,
  demoPlayers,
  demoThirdPlayer,
} from '../src/fixtures.js';
import { CampaignStateSchema } from '../src/schemas.js';
import {
  applyTurnResolution,
  areBothPlayersOnline,
  makeRoll,
  outcomeFor,
  startCampaign,
} from '../src/rules.js';
import type { TurnResolution } from '../src/schemas.js';

const now = new Date('2026-01-01T12:00:00.000Z');

function onlineCampaign() {
  const campaign = createDemoCampaign();
  for (const player of campaign.players) {
    campaign.presence[player.id] = {
      playerId: player.id,
      lastSeenAt: now.toISOString(),
      sessionId: `session-${player.id}`,
    };
  }
  return campaign;
}

describe('rules-light dice', () => {
  it('maps totals to the four outcomes', () => {
    expect(outcomeFor(16, 11)).toBe('great_success');
    expect(outcomeFor(11, 11)).toBe('success');
    expect(outcomeFor(8, 11)).toBe('success_with_complication');
    expect(outcomeFor(7, 11)).toBe('setback');
  });

  it('uses server randomness and the selected trait modifier', () => {
    const [player] = demoPlayers();
    const roll = makeRoll({
      id: 'roll-1',
      player,
      trait: 'heart',
      difficulty: 'tricky',
      reason: 'Encourage a worried friend',
      random: () => 0.5,
    });
    expect(roll.die).toBe(11);
    expect(roll.modifier).toBe(3);
    expect(roll.total).toBe(14);
    expect(roll.outcome).toBe('success');
  });
});

describe('campaign state reducer', () => {
  it('creates a custom opening without leaking the Everwood demo story', () => {
    const premise =
      'Four sleeping gods awaken beneath a ruined observatory and argue over who owns the dawn.';
    const campaign = createPlannedCampaign(
      'custom-campaign',
      'demo-family',
      {
        title: 'The Battle of the Four Gods',
        premise,
        contentSettings: {
          toneProfile: 'family_spooky',
          spookiness: 3,
          combatIntensity: 2,
          language: 'mild',
          permanentCharacterDeath: 'off',
        },
      },
      demoPlayers(),
      {
        premise: 'A model paraphrase that must not replace the parent idea.',
        secret: 'The gods are fragments of one forgotten guardian.',
        acts: ['Wake the first god.', 'Discover the division.', 'Choose a new dawn.'],
        factions: ['The Dawn Watch'],
        unresolvedThreats: ['The observatory is breaking apart.'],
        possibleEndings: ['Reunite the guardian.', 'Let the gods share the dawn.'],
      },
    );

    expect(CampaignStateSchema.parse(campaign)).toEqual(campaign);
    expect(campaign.gmBible.premise).toBe(premise);
    expect(campaign.lastNarration).toContain(premise);
    expect(campaign.world.location).not.toBe('The Lantern Gate');
    expect(campaign.world.characters).toEqual([]);
    expect(JSON.stringify(campaign)).not.toContain('Pip Bramblewing');
    expect(campaign.currentUi.theme).toBe('moonlit_ruins');
    expect(campaign.currentUi.musicCue).toBe('tension');
    expect(campaign.currentUi.artPrompt).toContain(premise);
  });

  it('upgrades legacy campaign atmosphere and safety settings without losing the story', () => {
    const legacy = structuredClone(createDemoCampaign()) as unknown as Record<string, unknown>;
    const ui = legacy.currentUi as Record<string, unknown>;
    delete ui.timeOfDay;
    delete ui.weather;
    delete ui.musicCue;
    delete ui.musicIntensity;
    delete ui.visualMood;
    legacy.contentSettings = { spookiness: 1, combatIntensity: 1 };

    const upgraded = CampaignStateSchema.parse(legacy);
    expect(upgraded.currentUi.timeOfDay).toBe('dusk');
    expect(upgraded.currentUi.musicCue).toBe('exploration');
    expect(upgraded.contentSettings.toneProfile).toBe('family_spooky');
    expect(upgraded.contentSettings.permanentCharacterDeath).toBe('off');
  });

  it('requires all selected players before starting', () => {
    const campaign = createDemoCampaign();
    expect(areBothPlayersOnline(campaign, now.getTime())).toBe(false);
    expect(() => startCampaign(campaign, now)).toThrow(/Every adventurer/);
  });

  it('uses one premise image for chapter one and the previous final scene for later chapters', () => {
    const campaign = onlineCampaign();
    campaign.currentUi.sceneArtUrl = 'https://example.test/chapter-one.png';
    campaign.currentUi.artNeeded = false;
    campaign.artGenerationsThisChapter = 1;

    const chapterOne = startCampaign(campaign, now);
    expect(chapterOne.artGenerationsThisChapter).toBe(1);
    expect(chapterOne.currentUi.sceneArtUrl).toBe('https://example.test/chapter-one.png');

    chapterOne.status = 'chapter_complete';
    chapterOne.lastNarration =
      'At the observatory, the glass giant opens its hand and reveals a storm-lit compass.';
    chapterOne.world.location = 'The Broken Observatory';
    chapterOne.world.locationDescription = 'A roofless tower beneath a spiral of violet clouds.';
    const chapterTwo = startCampaign(chapterOne, now);

    expect(chapterTwo.artGenerationsThisChapter).toBe(0);
    expect(chapterTwo.currentUi.artNeeded).toBe(true);
    expect(chapterTwo.currentUi.sceneArtUrl).toBeNull();
    expect(chapterTwo.currentUi.artPrompt).toContain('Opening image for chapter 2');
    expect(chapterTwo.currentUi.artPrompt).toContain('The Broken Observatory');
    expect(chapterTwo.currentUi.artPrompt).toContain('glass giant');
    expect(chapterTwo.currentUi.artPrompt?.length).toBeLessThanOrEqual(700);
  });

  it('starts and alternates the active player after a validated turn', () => {
    const active = startCampaign(onlineCampaign(), now);
    active.currentUi.sceneArtUrl = 'https://example.test/approved-scene.png';
    const actorId = active.activePlayerId as string;
    const nextId = active.playerOrder.find((id) => id !== actorId) as string;
    const resolution: TurnResolution = {
      narration: 'The silver tracks glow and lead deeper into the trees.',
      rolls: [],
      worldPatch: {
        location: null,
        locationDescription: null,
        addFacts: ['The tracks glow when both adventurers stand close together.'],
        addInventory: [],
        removeInventory: [],
        addConditions: [],
        clearConditions: [],
      },
      questUpdates: [],
      memoryWrites: [{ kind: 'fact', text: 'The tracks respond to teamwork.', importance: 3 }],
      uiDirective: {
        ...active.currentUi,
        sceneArtUrl: null,
        artNeeded: false,
        artPrompt: null,
      },
      featuredCharacterIds: ['pip'],
      chapterStatus: { state: 'continue', recap: null, cliffhanger: null },
      nextPlayerId: nextId,
    };

    const result = applyTurnResolution({
      campaign: active,
      actorId,
      action: 'Inspect the tracks',
      idempotencyKey: 'turn-key-1234',
      resolution,
      turnId: 'turn-1',
      now,
    });

    expect(result.campaign.activePlayerId).toBe(nextId);
    expect(result.campaign.world.discoveredFacts).toContain(
      'The tracks glow when both adventurers stand close together.',
    );
    expect(result.campaign.recentTurns).toHaveLength(1);
    expect(result.campaign.currentUi.sceneArtUrl).toBe('https://example.test/approved-scene.png');
  });

  it('requires and rotates through every player in a three-player campaign', () => {
    const players = [...demoPlayers(), demoThirdPlayer()];
    const campaign = createPlannedCampaign(
      'three-player-campaign',
      'demo-family',
      {
        title: 'The Three Star Keys',
        premise:
          'Three star keys have fallen into a maze whose rooms move whenever someone laughs.',
        playerIds: players.map((player) => player.id),
        contentSettings: {
          toneProfile: 'family_spooky',
          spookiness: 2,
          combatIntensity: 1,
          language: 'mild',
          permanentCharacterDeath: 'off',
        },
      },
      players,
    );
    for (const player of players.slice(0, 2)) {
      campaign.presence[player.id] = {
        playerId: player.id,
        sessionId: `session-${player.id}`,
        lastSeenAt: now.toISOString(),
      };
    }
    expect(() => startCampaign(campaign, now)).toThrow(/Every adventurer/);

    const third = players[2] as (typeof players)[number];
    campaign.presence[third.id] = {
      playerId: third.id,
      sessionId: `session-${third.id}`,
      lastSeenAt: now.toISOString(),
    };
    const active = startCampaign(campaign, now);
    expect(active.activePlayerId).toBe('demo-parent');
    expect(active.playerOrder).toEqual(['demo-parent', 'demo-child', 'demo-wren']);
  });

  it('rejects duplicate idempotency keys', () => {
    const campaign = startCampaign(onlineCampaign(), now);
    campaign.recentTurns.push({
      id: 'old',
      campaignId: campaign.id,
      chapterNumber: 1,
      turnNumber: 1,
      playerId: campaign.activePlayerId as string,
      playerAction: 'Look around',
      narration: 'You look around.',
      rolls: [],
      uiDirective: campaign.currentUi,
      createdAt: now.toISOString(),
      idempotencyKey: 'duplicate-key',
    });

    expect(() =>
      applyTurnResolution({
        campaign,
        actorId: campaign.activePlayerId as string,
        action: 'Look again',
        idempotencyKey: 'duplicate-key',
        resolution: {
          narration: 'Nothing changes.',
          rolls: [],
          worldPatch: {
            location: null,
            locationDescription: null,
            addFacts: [],
            addInventory: [],
            removeInventory: [],
            addConditions: [],
            clearConditions: [],
          },
          questUpdates: [],
          memoryWrites: [],
          uiDirective: campaign.currentUi,
          featuredCharacterIds: [],
          chapterStatus: { state: 'continue', recap: null, cliffhanger: null },
          nextPlayerId: 'demo-child',
        },
        turnId: 'turn-2',
        now,
      }),
    ).toThrow(/already been resolved/);
  });

  it('consumes a special move once and grants a trait after three chapters', () => {
    const campaign = onlineCampaign();
    campaign.status = 'chapter_complete';
    campaign.chapterNumber = 3;
    campaign.players[0].chapterStars = 2;
    campaign.players[1].chapterStars = 2;
    const active = startCampaign(campaign, now);
    expect(active.players[0].chapterStars).toBe(3);
    expect(active.players[0].traits.agility).toBe(1);

    const actorId = active.activePlayerId as string;
    const result = applyTurnResolution({
      campaign: active,
      actorId,
      action: 'Use my special move to help',
      idempotencyKey: 'special-move-key',
      resolution: {
        narration: 'The special move works at exactly the right moment.',
        rolls: [],
        worldPatch: {
          location: null,
          locationDescription: null,
          addFacts: [],
          addInventory: [],
          removeInventory: [],
          addConditions: [],
          clearConditions: [],
        },
        questUpdates: [],
        memoryWrites: [],
        uiDirective: active.currentUi,
        featuredCharacterIds: [],
        chapterStatus: { state: 'continue', recap: null, cliffhanger: null },
        nextPlayerId: active.playerOrder.find((id) => id !== actorId) as string,
      },
      turnId: 'special-turn',
      useSpecialMove: true,
      now,
    });
    expect(
      result.campaign.players.find((player) => player.id === actorId)?.specialMoveAvailable,
    ).toBe(false);
  });
});
