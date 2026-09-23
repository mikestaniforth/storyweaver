import { randomUUID } from 'node:crypto';
import {
  ActionInputSchema,
  ChapterFeedbackSchema,
  ChildSessionInputSchema,
  ContentSettingsSchema,
  CreateCampaignInputSchema,
  PresenceInputSchema,
  toCampaignView,
  type AuthenticatedPlayer,
} from '@family-adventure/shared';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { requireIdentity, requirePlayer, verifyAppCheck, type VerifiedIdentity } from './auth.js';
import type { AppConfig } from './config.js';
import { ApiError, errorHandler, notFoundHandler } from './errors.js';
import type { GameRepository } from './repositories/game-repository.js';
import { requireTaskIdentity, type ArtQueueService } from './services/art-queue-service.js';
import type { ChildAuthService } from './services/child-auth-service.js';
import { createPinHash } from './services/pin-service.js';
import type { GameService } from './services/game-service.js';

const ChildProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
  avatar: z.string().min(1).max(8),
  archetype: z.enum(['guardian', 'scout', 'inventor', 'storykeeper']),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
});

export interface AppDependencies {
  config: AppConfig;
  repository: GameRepository;
  game: GameService;
  childAuth: ChildAuthService;
  artQueue: ArtQueueService;
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function currentPlayer(res: Response): AuthenticatedPlayer {
  const player = res.locals.player as AuthenticatedPlayer | undefined;
  if (!player) throw new ApiError(401, 'authentication_required', 'Please sign in first.');
  return player;
}

function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  const result = Array.isArray(value) ? value[0] : value;
  if (!result)
    throw new ApiError(400, 'invalid_path', 'The requested adventure identifier is missing.');
  return result;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: deps.config.localDemoMode ? [/^http:\/\/localhost:\d+$/] : deps.config.allowedOrigins,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const startedAt = performance.now();
    res.on('finish', () => {
      console.info(
        JSON.stringify({
          level: 'info',
          requestId,
          method: req.method,
          path: req.route?.path ?? req.path,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
    });
    next();
  });

  app.post(
    '/internal/tasks/scene-art',
    requireTaskIdentity(deps.config),
    asyncRoute(async (req, res) => {
      const input = z.object({ campaignId: z.string().min(1).max(120) }).parse(req.body);
      await deps.game.generateArtForCampaign(input.campaignId);
      res.status(204).end();
    }),
  );

  app.post(
    '/internal/tasks/purge-deletions',
    requireTaskIdentity(deps.config),
    asyncRoute(async (_req, res) => {
      res.json({ purged: await deps.game.purgeDueCampaigns() });
    }),
  );

  app.use('/api', verifyAppCheck(deps.config));

  const childLoginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: deps.config.localDemoMode ? 100 : 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'too_many_attempts', message: 'Too many sign-in attempts. Try again later.' },
    },
  });
  const dailyQuota = (
    kind: 'story' | 'media',
    productionLimit: number,
    code: string,
    message: string,
  ) =>
    asyncRoute(async (_req, res, next) => {
      const familyId = currentPlayer(res).familyId;
      const allowed = await deps.repository.consumeDailyQuota(
        familyId,
        kind,
        deps.config.localDemoMode ? 2_000 : productionLimit,
      );
      if (!allowed) throw new ApiError(429, code, message);
      next();
    });
  const generationLimiter = dailyQuota(
    'story',
    120,
    'daily_story_limit',
    'This family has reached today’s story-generation limit. Continue tomorrow.',
  );
  const mediaLimiter = dailyQuota(
    'media',
    60,
    'daily_media_limit',
    'This family has reached today’s optional art and audio limit.',
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: deps.config.localDemoMode ? 'local-demo' : 'production',
      narrativeProvider: deps.config.narrativeProvider,
      region: deps.config.googleCloudLocation,
      vertexRegion: deps.config.vertexLocation,
    });
  });

  app.post(
    '/api/auth/child-session',
    childLoginLimiter,
    asyncRoute(async (req, res) => {
      const result = await deps.childAuth.createSession(ChildSessionInputSchema.parse(req.body));
      res.json(result);
    }),
  );

  const identity = requireIdentity(deps.config);
  const player = requirePlayer(deps.repository);

  app.post(
    '/api/bootstrap',
    identity,
    asyncRoute(async (_req, res) => {
      const verified = res.locals.identity as VerifiedIdentity;
      const existing = await deps.repository.getProfile(verified.uid);
      if (verified.role === 'child' || existing?.role === 'child') {
        throw new ApiError(
          403,
          'parent_required',
          'A child identity cannot create a parent account.',
        );
      }
      const result = await deps.repository.bootstrapParent(verified.uid, verified.displayName);
      res.json(result);
    }),
  );

  app.post(
    '/api/families/child-profile',
    identity,
    player,
    asyncRoute(async (req, res) => {
      const parent = currentPlayer(res);
      if (parent.role !== 'parent') {
        throw new ApiError(403, 'parent_required', 'Only the parent can create this profile.');
      }
      const input = ChildProfileInputSchema.parse(req.body);
      const pin = input.pin ? await createPinHash(input.pin) : null;
      const result = await deps.repository.createChildProfile(parent, {
        displayName: input.displayName,
        avatar: input.avatar,
        archetype: input.archetype,
        pinSalt: pin?.salt ?? null,
        pinHash: pin?.hash ?? null,
      });
      res.status(201).json(result);
    }),
  );

  app.post(
    '/api/families/rotate-code',
    identity,
    player,
    asyncRoute(async (_req, res) => {
      res.json(await deps.childAuth.rotateCodeAndRevoke(currentPlayer(res)));
    }),
  );

  app.get(
    '/api/campaigns',
    identity,
    player,
    asyncRoute(async (_req, res) => {
      res.json({ campaigns: await deps.game.listCampaigns(currentPlayer(res)) });
    }),
  );

  app.post(
    '/api/campaigns',
    identity,
    player,
    generationLimiter,
    asyncRoute(async (req, res) => {
      const campaign = await deps.game.createCampaign(
        currentPlayer(res),
        CreateCampaignInputSchema.parse(req.body),
      );
      res.status(201).json({ campaign });
    }),
  );

  app.get(
    '/api/campaigns/:id',
    identity,
    player,
    asyncRoute(async (req, res) => {
      res.json({ campaign: await deps.game.getCampaign(currentPlayer(res), pathParam(req, 'id')) });
    }),
  );

  app.patch(
    '/api/campaigns/:id/settings',
    identity,
    player,
    asyncRoute(async (req, res) => {
      const campaign = await deps.game.updateContentSettings(
        currentPlayer(res),
        pathParam(req, 'id'),
        ContentSettingsSchema.parse(req.body),
      );
      res.json({ campaign });
    }),
  );

  app.get(
    '/api/campaigns/:id/export',
    identity,
    player,
    asyncRoute(async (req, res) => {
      const campaignId = pathParam(req, 'id');
      const exported = await deps.game.exportCampaign(currentPlayer(res), campaignId);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="family-adventure-${campaignId}.json"`,
      );
      res.send(JSON.stringify(exported, null, 2));
    }),
  );

  app.post(
    '/api/campaigns/:id/presence',
    identity,
    player,
    asyncRoute(async (req, res) => {
      const input = PresenceInputSchema.parse(req.body);
      const campaign = await deps.game.updatePresence(
        currentPlayer(res),
        pathParam(req, 'id'),
        input.sessionId,
      );
      res.json({ campaign });
    }),
  );

  app.post(
    '/api/campaigns/:id/start',
    identity,
    player,
    asyncRoute(async (req, res) => {
      res.json({ campaign: await deps.game.start(currentPlayer(res), pathParam(req, 'id')) });
    }),
  );

  app.post(
    '/api/campaigns/:id/actions',
    identity,
    player,
    generationLimiter,
    asyncRoute(async (req, res) => {
      const result = await deps.game.act(
        currentPlayer(res),
        pathParam(req, 'id'),
        ActionInputSchema.parse(req.body),
      );
      res.json(result);
    }),
  );

  app.post(
    '/api/campaigns/:id/rewind',
    identity,
    player,
    asyncRoute(async (req, res) => {
      res.json({ campaign: await deps.game.rewind(currentPlayer(res), pathParam(req, 'id')) });
    }),
  );

  app.post(
    '/api/campaigns/:id/art',
    identity,
    player,
    mediaLimiter,
    asyncRoute(async (req, res) => {
      const campaignId = pathParam(req, 'id');
      const campaign = await deps.game.getCampaign(currentPlayer(res), campaignId);
      if (deps.artQueue.enabled) {
        await deps.artQueue.enqueue(campaignId, campaign.version);
        res.status(202).json({ campaign });
        return;
      }
      res.json({ campaign: await deps.game.generateArt(currentPlayer(res), campaignId) });
    }),
  );

  app.post(
    '/api/campaigns/:id/feedback',
    identity,
    player,
    asyncRoute(async (req, res) => {
      await deps.game.feedback(
        currentPlayer(res),
        pathParam(req, 'id'),
        ChapterFeedbackSchema.parse(req.body),
      );
      res.status(204).end();
    }),
  );

  app.post(
    '/api/turns/:id/audio',
    identity,
    player,
    mediaLimiter,
    asyncRoute(async (req, res) => {
      const audio = await deps.game.narrationAudio(currentPlayer(res), pathParam(req, 'id'));
      if (!audio) {
        res.status(204).end();
        return;
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=604800');
      res.send(audio);
    }),
  );

  app.delete(
    '/api/campaigns/:id',
    identity,
    player,
    asyncRoute(async (req, res) => {
      await deps.game.delete(currentPlayer(res), pathParam(req, 'id'));
      res.status(204).end();
    }),
  );

  app.get(
    '/api/debug/demo',
    asyncRoute(async (_req, res) => {
      if (!deps.config.localDemoMode) throw new ApiError(404, 'not_found', 'Not found.');
      const campaign = await deps.repository.getCampaign('demo-campaign');
      res.json({
        parentToken: 'demo-parent',
        childToken: 'demo-child',
        thirdPlayerToken: 'demo-wren',
        familyCode: 'STARLIGHT',
        pin: '2468',
        campaign: campaign ? toCampaignView(campaign) : null,
      });
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
