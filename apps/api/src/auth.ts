import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import type { AppConfig } from './config.js';
import { ApiError } from './errors.js';
import type { GameRepository } from './repositories/game-repository.js';

export interface VerifiedIdentity {
  uid: string;
  displayName: string;
  role?: 'child';
}

function bearerToken(req: Request): string | null {
  const value = req.header('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
}

export function requireIdentity(config: AppConfig): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req);
      if (!token) throw new ApiError(401, 'authentication_required', 'Please sign in first.');
      if (
        config.localDemoMode &&
        (token === 'demo-parent' ||
          token === 'demo-child' ||
          token === 'demo-wren' ||
          token.startsWith('child-'))
      ) {
        res.locals.identity = {
          uid: token,
          ...(token === 'demo-parent' ? {} : { role: 'child' as const }),
          displayName: token === 'demo-parent' ? 'Dad' : token === 'demo-wren' ? 'Wren' : 'Rowan',
        } satisfies VerifiedIdentity;
        next();
        return;
      }
      if (config.localDemoMode)
        throw new ApiError(401, 'invalid_token', 'Use a local demo identity.');
      if (getApps().length === 0) initializeApp();
      const decoded = await getAuth().verifyIdToken(token, true);
      res.locals.identity = {
        uid: decoded.uid,
        ...(decoded.role === 'child' ? { role: 'child' as const } : {}),
        displayName:
          typeof decoded.name === 'string'
            ? decoded.name
            : typeof decoded.email === 'string'
              ? (decoded.email.split('@')[0] ?? 'Adventurer')
              : 'Adventurer',
      } satisfies VerifiedIdentity;
      next();
    } catch (error) {
      next(
        error instanceof ApiError ? error : new ApiError(401, 'invalid_token', 'Sign in again.'),
      );
    }
  };
}

export function requirePlayer(repository: GameRepository): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const identity = res.locals.identity as VerifiedIdentity | undefined;
      if (!identity) throw new ApiError(401, 'authentication_required', 'Please sign in first.');
      const profile = await repository.getProfile(identity.uid);
      if (!profile) {
        throw new ApiError(403, 'profile_required', 'Create your family profile before playing.');
      }
      res.locals.player = {
        id: profile.id,
        familyId: profile.familyId,
        role: profile.role,
        displayName: profile.displayName,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function verifyAppCheck(config: AppConfig): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!config.requireAppCheck || config.localDemoMode || req.path === '/health') {
      next();
      return;
    }
    try {
      const token = req.header('x-firebase-appcheck');
      if (!token) throw new Error('missing token');
      if (getApps().length === 0) initializeApp();
      await getAppCheck().verifyToken(token);
      next();
    } catch {
      next(
        new ApiError(401, 'invalid_app', 'The app could not be verified. Refresh and try again.'),
      );
    }
  };
}
