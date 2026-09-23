import type { AuthenticatedPlayer, ChildSessionInput } from '@family-adventure/shared';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { AppConfig } from '../config.js';
import { ApiError } from '../errors.js';
import type { BootstrapData, GameRepository } from '../repositories/game-repository.js';
import { hashFamilyCode, verifyPin } from './pin-service.js';

export class ChildAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: GameRepository,
  ) {}

  async createSession(input: ChildSessionInput): Promise<{
    customToken: string;
    player: { id: string; displayName: string; avatar: string };
  }> {
    if (
      this.config.localDemoMode &&
      input.familyCode.toUpperCase() === 'STARLIGHT' &&
      input.pin === '2468'
    ) {
      const children = (await this.repository.getFamilyProfiles('demo-family')).filter(
        (profile) => profile.role === 'child',
      );
      const normalizedName = input.adventurerName?.toLocaleLowerCase();
      const profile = normalizedName
        ? children.find((candidate) => candidate.displayName.toLocaleLowerCase() === normalizedName)
        : children.find((candidate) => candidate.id === 'demo-child');
      if (!profile) {
        throw new ApiError(401, 'invalid_family_login', 'That adventurer name was not recognised.');
      }
      return {
        customToken: profile.id,
        player: { id: profile.id, displayName: profile.displayName, avatar: profile.avatar },
      };
    }

    if (this.config.localDemoMode) {
      throw new ApiError(401, 'invalid_family_login', 'Use the fictional local demo credentials.');
    }

    const credential = await this.repository.findChildCredential(
      hashFamilyCode(input.familyCode),
      input.adventurerName,
    );
    if (!credential?.family.pinSalt || !credential.family.pinHash) {
      throw new ApiError(
        401,
        'invalid_family_login',
        'That family code or PIN was not recognised.',
      );
    }
    if (
      credential.family.lockedUntil &&
      new Date(credential.family.lockedUntil).getTime() > Date.now()
    ) {
      throw new ApiError(
        429,
        'login_locked',
        'Too many attempts. Ask your parent to try again later.',
      );
    }
    const valid = await verifyPin(input.pin, credential.family.pinSalt, credential.family.pinHash);
    await this.repository.recordPinAttempt(credential.family.id, valid);
    if (!valid) {
      throw new ApiError(
        401,
        'invalid_family_login',
        'That family code or PIN was not recognised.',
      );
    }
    if (getApps().length === 0) initializeApp();
    const auth = getAuth();
    try {
      await auth.updateUser(credential.profile.id, { disabled: false });
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      await auth.createUser({
        uid: credential.profile.id,
        displayName: credential.profile.displayName,
        disabled: false,
      });
    }
    const customToken = await auth.createCustomToken(credential.profile.id, {
      role: 'child',
      familyId: credential.family.id,
    });
    return {
      customToken,
      player: {
        id: credential.profile.id,
        displayName: credential.profile.displayName,
        avatar: credential.profile.avatar,
      },
    };
  }

  async rotateCodeAndRevoke(parent: AuthenticatedPlayer): Promise<BootstrapData> {
    if (parent.role !== 'parent') {
      throw new ApiError(403, 'parent_required', 'Only the parent can rotate the family code.');
    }
    const children = (await this.repository.getFamilyProfiles(parent.familyId)).filter(
      (profile) => profile.role === 'child',
    );
    if (children.length > 0 && !this.config.localDemoMode) {
      if (getApps().length === 0) initializeApp();
      const auth = getAuth();
      for (const child of children) {
        try {
          await auth.updateUser(child.id, { disabled: true });
          await auth.revokeRefreshTokens(child.id);
        } catch (error) {
          if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
        }
      }
    }
    return this.repository.rotateFamilyCode(parent);
  }
}
