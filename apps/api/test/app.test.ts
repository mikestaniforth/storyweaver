import type { TurnResolution } from '@family-adventure/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalNarrativeProvider } from '../src/providers/local-narrative-provider.js';
import type { NarrativeProvider } from '../src/providers/narrative-provider.js';
import { InMemoryGameRepository } from '../src/repositories/in-memory-repository.js';
import { ChildAuthService } from '../src/services/child-auth-service.js';
import { ArtQueueService } from '../src/services/art-queue-service.js';
import { GameService } from '../src/services/game-service.js';
import { MediaService } from '../src/services/media-service.js';
import { MemoryService } from '../src/services/memory-service.js';
import { ModelArmorService } from '../src/services/model-armor.js';

function testApp(narrative: NarrativeProvider = new LocalNarrativeProvider()) {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOCAL_DEMO_MODE: 'true',
    PORT: '8787',
    ALLOWED_ORIGIN: 'http://localhost:5173',
    NARRATIVE_PROVIDER: 'local',
    REQUIRE_APP_CHECK: 'false',
  });
  const repository = new InMemoryGameRepository(true);
  const armor = new ModelArmorService(config);
  const memory = new MemoryService(config, repository);
  const media = new MediaService(config);
  const game = new GameService(repository, narrative, armor, memory, media);
  return createApp({
    config,
    repository,
    game,
    childAuth: new ChildAuthService(config, repository),
    artQueue: new ArtQueueService(config),
  });
}

describe('family game API', () => {
  let app: ReturnType<typeof testApp>;

  beforeEach(() => {
    app = testApp();
  });

  it('rejects unknown local bearer identities before cloud auth', async () => {
    const response = await request(app)
      .get('/api/campaigns/demo-campaign')
      .set('Authorization', 'Bearer unknown-demo-token');
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Use a local demo identity.');
  });

  it('denies child self-promotion and preserves legitimate parent setup', async () => {
    for (const token of ['demo-child', 'demo-wren', 'child-unregistered']) {
      const denied = await request(app)
        .post('/api/bootstrap')
        .set('Authorization', `Bearer ${token}`);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('parent_required');
    }
    const parent = await request(app)
      .post('/api/bootstrap')
      .set('Authorization', 'Bearer demo-parent');
    expect(parent.status).toBe(200);
    const child = await request(app)
      .get('/api/campaigns/demo-campaign')
      .set('Authorization', 'Bearer demo-child');
    expect(child.status).toBe(200);
    const deniedExport = await request(app)
      .get('/api/campaigns/demo-campaign/export')
      .set('Authorization', 'Bearer demo-child');
    expect(deniedExport.status).toBe(403);
  });

  it('rejects invalid local child credentials without querying cloud-backed credentials', async () => {
    const config = loadConfig({ NODE_ENV: 'test', LOCAL_DEMO_MODE: 'true' });
    const repository = new InMemoryGameRepository(true);
    const lookup = vi.spyOn(repository, 'findChildCredential');
    const service = new ChildAuthService(config, repository);
    await expect(service.createSession({ familyCode: 'WRONG', pin: '0000' })).rejects.toMatchObject(
      { status: 401 },
    );
    expect(lookup).not.toHaveBeenCalled();
    const session = await service.createSession({
      familyCode: 'STARLIGHT',
      pin: '2468',
      adventurerName: 'Rowan',
    });
    expect(session.customToken).toBe('demo-child');
  });

  it('does not expose the secret GM bible', async () => {
    const response = await request(app)
      .get('/api/campaigns/demo-campaign')
      .set('Authorization', 'Bearer demo-parent');
    expect(response.status).toBe(200);
    expect(response.body.campaign.title).toBe('The Lanterns of Everwood');
    expect(response.body.campaign.gmBible).toBeUndefined();
  });

  it('uses a new campaign title and premise in its visible opening scene', async () => {
    const premise =
      'Four sleeping gods awaken beneath a ruined observatory and argue over who owns the dawn.';
    const response = await request(app)
      .post('/api/campaigns')
      .set('Authorization', 'Bearer demo-parent')
      .send({
        title: 'The Battle of the Four Gods',
        premise,
        contentSettings: {
          toneProfile: 'family_spooky',
          spookiness: 3,
          combatIntensity: 2,
          language: 'mild',
          permanentCharacterDeath: 'off',
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.campaign.title).toBe('The Battle of the Four Gods');
    expect(response.body.campaign.lastNarration).toContain(premise);
    expect(response.body.campaign.world.location).not.toBe('The Lantern Gate');
    expect(response.body.campaign.world.characters).toEqual([]);
    expect(JSON.stringify(response.body.campaign)).not.toContain('Pip Bramblewing');
  });

  it('requires both players online, starts, resolves, and alternates a turn', async () => {
    const parentHeaders = { Authorization: 'Bearer demo-parent' };
    const childHeaders = { Authorization: 'Bearer demo-child' };

    const premature = await request(app)
      .post('/api/campaigns/demo-campaign/start')
      .set(parentHeaders);
    expect(premature.status).toBe(409);

    await request(app)
      .post('/api/campaigns/demo-campaign/presence')
      .set(parentHeaders)
      .send({ sessionId: 'parent-session-123' });
    await request(app)
      .post('/api/campaigns/demo-campaign/presence')
      .set(childHeaders)
      .send({ sessionId: 'child-session-1234' });

    const started = await request(app)
      .post('/api/campaigns/demo-campaign/start')
      .set(parentHeaders);
    expect(started.status).toBe(200);
    expect(started.body.campaign.activePlayerId).toBe('demo-parent');

    const action = {
      action: 'Carefully inspect the silver footprints with my compass',
      idempotencyKey: 'parent-first-action-key',
    };
    const resolved = await request(app)
      .post('/api/campaigns/demo-campaign/actions')
      .set(parentHeaders)
      .send(action);
    expect(resolved.status).toBe(200);
    expect(resolved.body.campaign.activePlayerId).toBe('demo-child');
    expect(resolved.body.campaign.lastRolls).toHaveLength(1);
    expect(resolved.body.campaign.currentUi.artNeeded).toBe(true);
    expect(resolved.body.campaign.currentUi.artPrompt).toContain('16-bit pixel-art fantasy forest');

    const replayed = await request(app)
      .post('/api/campaigns/demo-campaign/actions')
      .set(parentHeaders)
      .send(action);
    expect(replayed.status).toBe(200);
    expect(replayed.body.replayed).toBe(true);
    expect(replayed.body.campaign.totalTurns).toBe(1);

    const rewound = await request(app)
      .post('/api/campaigns/demo-campaign/rewind')
      .set(parentHeaders);
    expect(rewound.status).toBe(200);
    expect(rewound.body.campaign.totalTurns).toBe(0);
    const exported = await request(app)
      .get('/api/campaigns/demo-campaign/export')
      .set(parentHeaders);
    expect(exported.body.turns).toHaveLength(0);
  });

  it('accepts the child family code without collecting an email', async () => {
    const response = await request(app)
      .post('/api/auth/child-session')
      .send({ familyCode: 'STARLIGHT', pin: '2468' });
    expect(response.status).toBe(200);
    expect(response.body.customToken).toBe('demo-child');
    expect(response.body.player.displayName).toBe('Rowan');
  });

  it('creates a three-player campaign and rotates the spotlight through all players', async () => {
    const created = await request(app)
      .post('/api/campaigns')
      .set('Authorization', 'Bearer demo-parent')
      .send({
        title: 'The Three Star Keys',
        premise:
          'Three star keys have fallen into a maze whose rooms move whenever someone laughs.',
        playerIds: ['demo-parent', 'demo-child', 'demo-wren'],
        contentSettings: {
          toneProfile: 'family_spooky',
          spookiness: 2,
          combatIntensity: 1,
          language: 'mild',
          permanentCharacterDeath: 'off',
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.campaign.players.map((player: { id: string }) => player.id)).toEqual([
      'demo-parent',
      'demo-child',
      'demo-wren',
    ]);

    const campaignId = created.body.campaign.id as string;
    for (const [token, sessionId] of [
      ['demo-parent', 'three-parent-session'],
      ['demo-child', 'three-child-session'],
      ['demo-wren', 'three-eva-session'],
    ]) {
      const presence = await request(app)
        .post(`/api/campaigns/${campaignId}/presence`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sessionId });
      expect(presence.status).toBe(200);
    }

    const started = await request(app)
      .post(`/api/campaigns/${campaignId}/start`)
      .set('Authorization', 'Bearer demo-parent');
    expect(started.status).toBe(200);
    expect(started.body.campaign.activePlayerId).toBe('demo-parent');

    for (const [token, expectedNext, key] of [
      ['demo-parent', 'demo-child', 'three-player-parent-turn'],
      ['demo-child', 'demo-wren', 'three-player-child-turn'],
      ['demo-wren', 'demo-parent', 'three-player-eva-turn'],
    ]) {
      const turn = await request(app)
        .post(`/api/campaigns/${campaignId}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'Look carefully for the next star key', idempotencyKey: key });
      expect(turn.status).toBe(200);
      expect(turn.body.campaign.activePlayerId).toBe(expectedNext);
    }

    const evaLogin = await request(app)
      .post('/api/auth/child-session')
      .send({ familyCode: 'STARLIGHT', pin: '2468', adventurerName: 'Wren' });
    expect(evaLogin.status).toBe(200);
    expect(evaLogin.body.customToken).toBe('demo-wren');
  });

  it('lets only the parent export secrets and rotate access', async () => {
    const denied = await request(app)
      .get('/api/campaigns/demo-campaign/export')
      .set('Authorization', 'Bearer demo-child');
    expect(denied.status).toBe(403);

    const exported = await request(app)
      .get('/api/campaigns/demo-campaign/export')
      .set('Authorization', 'Bearer demo-parent');
    expect(exported.status).toBe(200);
    expect(exported.body.campaign.gmBible.secret).toBeTruthy();

    const rotated = await request(app)
      .post('/api/families/rotate-code')
      .set('Authorization', 'Bearer demo-parent');
    expect(rotated.status).toBe(200);
    expect(rotated.body.family.familyCode).toBe('STARLIGHT');
  });

  it('lets only the parent change the Family Spooky boundaries', async () => {
    const settings = {
      toneProfile: 'family_spooky',
      spookiness: 3,
      combatIntensity: 2,
      language: 'mild',
      permanentCharacterDeath: 'off',
    };
    const denied = await request(app)
      .patch('/api/campaigns/demo-campaign/settings')
      .set('Authorization', 'Bearer demo-child')
      .send(settings);
    expect(denied.status).toBe(403);

    const updated = await request(app)
      .patch('/api/campaigns/demo-campaign/settings')
      .set('Authorization', 'Bearer demo-parent')
      .send(settings);
    expect(updated.status).toBe(200);
    expect(updated.body.campaign.contentSettings).toEqual(settings);
    expect(updated.body.campaign.currentUi.musicCue).toBe('wonder');
    expect(updated.body.campaign.currentUi.timeOfDay).toBe('dusk');
  });

  it('never commits malformed provider output and releases the action claim', async () => {
    const local = new LocalNarrativeProvider();
    app = testApp({
      name: 'malformed-test-provider',
      planCampaign: (input) => local.planCampaign(input),
      resolveTurn: async () => ({ narration: '' }) as TurnResolution,
    });
    const parentHeaders = { Authorization: 'Bearer demo-parent' };
    const childHeaders = { Authorization: 'Bearer demo-child' };
    await request(app)
      .post('/api/campaigns/demo-campaign/presence')
      .set(parentHeaders)
      .send({ sessionId: 'parent-malformed-test' });
    await request(app)
      .post('/api/campaigns/demo-campaign/presence')
      .set(childHeaders)
      .send({ sessionId: 'child-malformed-test' });
    await request(app).post('/api/campaigns/demo-campaign/start').set(parentHeaders);

    const action = {
      action: 'Try an uncertain plan',
      idempotencyKey: 'malformed-provider-key',
    };
    const failed = await request(app)
      .post('/api/campaigns/demo-campaign/actions')
      .set(parentHeaders)
      .send(action);
    expect(failed.status).toBe(500);

    const unchanged = await request(app).get('/api/campaigns/demo-campaign').set(parentHeaders);
    expect(unchanged.body.campaign.totalTurns).toBe(0);
    expect(unchanged.body.campaign.activePlayerId).toBe('demo-parent');

    const retried = await request(app)
      .post('/api/campaigns/demo-campaign/actions')
      .set(parentHeaders)
      .send(action);
    expect(retried.status).toBe(500);
    expect(retried.body.error.code).not.toBe('action_in_progress');
  });

  it('allows only one paid resolution for concurrent actions on the same turn', async () => {
    const local = new LocalNarrativeProvider();
    let resolutions = 0;
    app = testApp({
      name: 'slow-test-provider',
      planCampaign: (input) => local.planCampaign(input),
      resolveTurn: async (input) => {
        resolutions += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return local.resolveTurn(input);
      },
    });
    const parentHeaders = { Authorization: 'Bearer demo-parent' };
    await request(app)
      .post('/api/campaigns/demo-campaign/presence')
      .set(parentHeaders)
      .send({ sessionId: 'parent-concurrency-test' });
    await request(app)
      .post('/api/campaigns/demo-campaign/presence')
      .set('Authorization', 'Bearer demo-child')
      .send({ sessionId: 'child-concurrency-test' });
    await request(app).post('/api/campaigns/demo-campaign/start').set(parentHeaders);

    const responses = await Promise.all([
      request(app).post('/api/campaigns/demo-campaign/actions').set(parentHeaders).send({
        action: 'Open the moonlit door carefully',
        idempotencyKey: 'concurrent-key-one',
      }),
      request(app).post('/api/campaigns/demo-campaign/actions').set(parentHeaders).send({
        action: 'Knock on the moonlit door',
        idempotencyKey: 'concurrent-key-two',
      }),
    ]);

    expect(resolutions).toBe(1);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});

describe('durable abuse and billing controls', () => {
  afterEach(() => vi.useRealTimers());

  it('stores two child profiles under one parent-managed family login', async () => {
    const repository = new InMemoryGameRepository(false);
    const bootstrap = await repository.bootstrapParent('test-parent', 'Parent');
    const parent = bootstrap.profiles.find((profile) => profile.role === 'parent');
    expect(parent).toBeTruthy();

    const first = await repository.createChildProfile(parent!, {
      displayName: 'Linc',
      avatar: '🦉',
      archetype: 'guardian',
      pinSalt: 'family-pin-salt',
      pinHash: 'family-pin-hash',
    });
    const second = await repository.createChildProfile(parent!, {
      displayName: 'Wren',
      avatar: '🐉',
      archetype: 'inventor',
      pinSalt: null,
      pinHash: null,
    });

    expect(first.family.childProfileIds).toHaveLength(1);
    expect(second.family.childProfileIds).toHaveLength(2);
    expect(second.profiles.filter((profile) => profile.role === 'child')).toHaveLength(2);
    await expect(
      repository.createChildProfile(parent!, {
        displayName: 'Another',
        avatar: '🦊',
        archetype: 'scout',
        pinSalt: null,
        pinHash: null,
      }),
    ).rejects.toThrow(/already has two/);
  });

  it('atomically enforces the shared daily family quota', async () => {
    const repository = new InMemoryGameRepository(true);
    const results = await Promise.all([
      repository.consumeDailyQuota('demo-family', 'story', 1),
      repository.consumeDailyQuota('demo-family', 'story', 1),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it('does not renew a family lockout with one attempt after the cooldown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T10:00:00.000Z'));
    const repository = new InMemoryGameRepository(true);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await repository.recordPinAttempt('demo-family', false);
    }
    const locked = await repository.findChildCredential('demo-family-code-hash', 'Rowan');
    expect(locked?.family.lockedUntil).toBe('2026-07-19T10:15:00.000Z');

    vi.advanceTimersByTime(15 * 60_000);
    await repository.recordPinAttempt('demo-family', false);
    const reset = await repository.findChildCredential('demo-family-code-hash', 'Rowan');
    expect(reset?.family.failedPinAttempts).toBe(1);
    expect(reset?.family.lockedUntil).toBeNull();
  });

  it('reserves scene art before invoking the paid image provider', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOCAL_DEMO_MODE: 'true',
      NARRATIVE_PROVIDER: 'local',
      REQUIRE_APP_CHECK: 'false',
    });
    const repository = new InMemoryGameRepository(true);
    const media = new MediaService(config);
    const generate = vi.spyOn(media, 'generateSceneArt').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 'https://example.invalid/private-scene.png';
    });
    const game = new GameService(
      repository,
      new LocalNarrativeProvider(),
      new ModelArmorService(config),
      new MemoryService(config, repository),
      media,
    );

    const results = await Promise.all([
      game.generateArtForCampaign('demo-campaign'),
      game.generateArtForCampaign('demo-campaign'),
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      results.some((campaign) => campaign.currentUi.sceneArtUrl?.includes('example.invalid')),
    ).toBe(true);
    const afterLimit = await game.generateArtForCampaign('demo-campaign');
    expect(afterLimit.artGenerationsThisChapter).toBe(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('attaches a reserved chapter image after a same-chapter story version change', async () => {
    const repository = new InMemoryGameRepository(true);
    const claimed = await repository.claimSceneArt('demo-campaign');
    expect(claimed).not.toBeNull();

    const changed = {
      ...claimed!,
      lastNarration: 'The party takes one careful step while the painter is working.',
      version: claimed!.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await repository.commitTransition({ previous: claimed!, next: changed });
    const withArt = await repository.setSceneArt(
      'demo-campaign',
      claimed!.chapterNumber,
      'https://example.invalid/chapter-opening.png',
    );

    expect(withArt.lastNarration).toContain('painter is working');
    expect(withArt.currentUi.sceneArtUrl).toContain('chapter-opening.png');
    expect(withArt.artGenerationsThisChapter).toBe(1);
    expect(withArt.version).toBe(changed.version + 1);
    expect(await repository.claimSceneArt('demo-campaign')).toBeNull();
  });
});
