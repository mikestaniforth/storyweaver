import { createHash } from 'node:crypto';
import {
  ART_GENERATIONS_PER_CHAPTER,
  CampaignStateSchema,
  createPlannedCampaign,
  toCampaignView,
  type AuthenticatedPlayer,
  type CampaignState,
  type ChapterFeedback,
  type ContentSettings,
  type CreateCampaignInput,
  type GmBible,
  type PlayerProfile,
  type TurnRecord,
} from '@family-adventure/shared';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import type {
  BootstrapData,
  ChildCredential,
  CreateChildInput,
  FamilyRecord,
  GameRepository,
  StoredMemory,
} from './game-repository.js';

function familyCodeHash(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

const archetypeTraits: Record<PlayerProfile['archetype'], PlayerProfile['traits']> = {
  guardian: { might: 2, agility: 0, wits: 1, heart: 3 },
  scout: { might: 0, agility: 3, wits: 2, heart: 1 },
  inventor: { might: 0, agility: 1, wits: 3, heart: 2 },
  storykeeper: { might: 1, agility: 0, wits: 2, heart: 3 },
};

const specialMoves: Record<PlayerProfile['archetype'], string> = {
  guardian: 'Stand Together — turn a setback into a success with a complication.',
  scout: 'Foxstep — slip through danger without making a roll.',
  inventor: 'Bright Idea — reveal a useful tool you prepared earlier.',
  storykeeper: 'Old Tale — remember a clue everyone else overlooked.',
};

export class FirestoreGameRepository implements GameRepository {
  private readonly db: Firestore;

  constructor(projectId?: string) {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: applicationDefault(),
        ...(projectId ? { projectId } : {}),
      });
    this.db = getFirestore(app);
  }

  async getProfile(playerId: string): Promise<PlayerProfile | null> {
    const snapshot = await this.db.collection('profiles').doc(playerId).get();
    return snapshot.exists ? (snapshot.data() as PlayerProfile) : null;
  }

  async getFamilyProfiles(familyId: string): Promise<PlayerProfile[]> {
    const snapshot = await this.db.collection('profiles').where('familyId', '==', familyId).get();
    return snapshot.docs.map((doc) => doc.data() as PlayerProfile);
  }

  async bootstrapParent(uid: string, displayName: string): Promise<BootstrapData> {
    const existing = await this.db
      .collection('families')
      .where('parentUid', '==', uid)
      .limit(1)
      .get();

    let family: FamilyRecord;
    if (!existing.empty) {
      family = existing.docs[0]?.data() as FamilyRecord;
    } else {
      const familyId = `family-${nanoid(12)}`;
      const code = nanoid(8).toUpperCase();
      family = {
        id: familyId,
        parentUid: uid,
        familyCode: code,
        familyCodeHash: familyCodeHash(code),
        pinSalt: null,
        pinHash: null,
        failedPinAttempts: 0,
        lockedUntil: null,
        childProfileId: null,
        childProfileIds: [],
        createdAt: new Date().toISOString(),
      };
      const parent: PlayerProfile = {
        id: uid,
        familyId,
        role: 'parent',
        displayName: displayName.slice(0, 30) || 'Parent',
        avatar: '🛡️',
        ageBand: 'adult',
        archetype: 'guardian',
        traits: archetypeTraits.guardian,
        inventory: ['Travel cloak'],
        conditions: [],
        specialMove: specialMoves.guardian,
        specialMoveAvailable: true,
        chapterStars: 0,
      };
      const batch = this.db.batch();
      batch.create(this.db.collection('families').doc(familyId), family);
      batch.create(this.db.collection('profiles').doc(uid), parent);
      await batch.commit();
    }

    const profiles = await this.db.collection('profiles').where('familyId', '==', family.id).get();
    return {
      family: {
        id: family.id,
        familyCode: family.familyCode,
        childProfileId: family.childProfileId,
        childProfileIds:
          family.childProfileIds ?? (family.childProfileId ? [family.childProfileId] : []),
      },
      profiles: profiles.docs.map((doc) => doc.data() as PlayerProfile),
    };
  }

  async createChildProfile(
    parent: AuthenticatedPlayer,
    input: CreateChildInput,
  ): Promise<BootstrapData> {
    const familyRef = this.db.collection('families').doc(parent.familyId);
    const childId = `child-${nanoid(12)}`;
    const child: PlayerProfile = {
      id: childId,
      familyId: parent.familyId,
      role: 'child',
      displayName: input.displayName,
      avatar: input.avatar,
      ageBand: '8-12',
      archetype: input.archetype,
      traits: archetypeTraits[input.archetype],
      inventory: ['Pocket lantern'],
      conditions: [],
      specialMove: specialMoves[input.archetype],
      specialMoveAvailable: true,
      chapterStars: 0,
    };

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(familyRef);
      if (!snapshot.exists) throw new Error('Family not found.');
      const family = snapshot.data() as FamilyRecord;
      if (family.parentUid !== parent.id) throw new Error('Only the parent can add a profile.');
      const childProfileIds =
        family.childProfileIds ?? (family.childProfileId ? [family.childProfileId] : []);
      if (childProfileIds.length >= 2) {
        throw new Error('This family already has two young adventurer profiles.');
      }
      const existingProfiles =
        childProfileIds.length > 0
          ? await transaction.getAll(
              ...childProfileIds.map((id) => this.db.collection('profiles').doc(id)),
            )
          : [];
      if (
        existingProfiles.some(
          (profile) =>
            (profile.data() as PlayerProfile | undefined)?.displayName.toLocaleLowerCase() ===
            input.displayName.toLocaleLowerCase(),
        )
      ) {
        throw new Error('Choose a different adventure name for each young adventurer.');
      }
      if ((!family.pinSalt || !family.pinHash) && (!input.pinSalt || !input.pinHash)) {
        throw new Error('A family PIN is required for the first young adventurer.');
      }
      transaction.create(this.db.collection('profiles').doc(childId), child);
      transaction.update(familyRef, {
        childProfileId: family.childProfileId ?? childId,
        childProfileIds: [...childProfileIds, childId],
        ...(input.pinSalt && input.pinHash
          ? { pinSalt: input.pinSalt, pinHash: input.pinHash }
          : {}),
      });
    });
    return this.bootstrapParent(parent.id, parent.displayName);
  }

  async rotateFamilyCode(parent: AuthenticatedPlayer): Promise<BootstrapData> {
    const familyRef = this.db.collection('families').doc(parent.familyId);
    const familyCode = nanoid(8).toUpperCase();
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(familyRef);
      if (!snapshot.exists || (snapshot.data() as FamilyRecord).parentUid !== parent.id) {
        throw new Error('Family not found.');
      }
      transaction.update(familyRef, {
        familyCode,
        familyCodeHash: familyCodeHash(familyCode),
        failedPinAttempts: 0,
        lockedUntil: null,
      });
    });
    return this.bootstrapParent(parent.id, parent.displayName);
  }

  async findChildCredential(
    codeHash: string,
    adventurerName?: string,
  ): Promise<ChildCredential | null> {
    const families = await this.db
      .collection('families')
      .where('familyCodeHash', '==', codeHash)
      .limit(1)
      .get();
    if (families.empty) return null;
    const family = families.docs[0]?.data() as FamilyRecord;
    const profiles = (await this.getFamilyProfiles(family.id)).filter(
      (profile) => profile.role === 'child',
    );
    const normalizedName = adventurerName?.trim().toLocaleLowerCase();
    const profile = normalizedName
      ? profiles.find((candidate) => candidate.displayName.toLocaleLowerCase() === normalizedName)
      : profiles.length === 1
        ? profiles[0]
        : null;
    return profile ? { family, profile } : null;
  }

  async recordPinAttempt(familyId: string, success: boolean): Promise<void> {
    const ref = this.db.collection('families').doc(familyId);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const family = snapshot.data() as FamilyRecord;
      if (success) {
        transaction.update(ref, { failedPinAttempts: 0, lockedUntil: null });
        return;
      }
      const lockExpired = Boolean(
        family.lockedUntil && new Date(family.lockedUntil).getTime() <= Date.now(),
      );
      const failedPinAttempts = lockExpired ? 1 : family.failedPinAttempts + 1;
      transaction.update(ref, {
        failedPinAttempts,
        lockedUntil:
          failedPinAttempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
      });
    });
  }

  async consumeDailyQuota(
    familyId: string,
    kind: 'story' | 'media',
    limit: number,
  ): Promise<boolean> {
    const date = new Date().toISOString().slice(0, 10);
    const id = createHash('sha256').update(`${familyId}:${date}`).digest('hex');
    const ref = this.db.collection('dailyUsage').doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const used = Number(snapshot.data()?.[kind] ?? 0);
      if (used >= limit) return false;
      transaction.set(
        ref,
        { familyId, date, [kind]: used + 1, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      return true;
    });
  }

  async listCampaigns(familyId: string): Promise<CampaignState[]> {
    const snapshot = await this.db
      .collection('campaigns')
      .where('familyId', '==', familyId)
      .orderBy('updatedAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => CampaignStateSchema.parse(doc.data()));
  }

  async getCampaign(campaignId: string): Promise<CampaignState | null> {
    const snapshot = await this.db.collection('campaigns').doc(campaignId).get();
    return snapshot.exists ? CampaignStateSchema.parse(snapshot.data()) : null;
  }

  async getTurn(turnId: string): Promise<TurnRecord | null> {
    const snapshot = await this.db.collection('turns').doc(turnId).get();
    return snapshot.exists ? (snapshot.data() as TurnRecord) : null;
  }

  async listTurns(campaignId: string): Promise<TurnRecord[]> {
    const snapshot = await this.db
      .collection('turns')
      .where('campaignId', '==', campaignId)
      .orderBy('turnNumber', 'asc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as TurnRecord);
  }

  async createCampaign(
    familyId: string,
    input: CreateCampaignInput,
    players: PlayerProfile[],
    gmBible?: GmBible,
  ): Promise<CampaignState> {
    const campaign = createPlannedCampaign(
      `campaign-${nanoid(12)}`,
      familyId,
      input,
      players,
      gmBible,
    );
    const batch = this.db.batch();
    batch.create(this.db.collection('campaigns').doc(campaign.id), campaign);
    batch.create(this.db.collection('campaignViews').doc(campaign.id), toCampaignView(campaign));
    await batch.commit();
    return campaign;
  }

  async updatePresence(
    campaignId: string,
    playerId: string,
    sessionId: string,
    now: Date,
  ): Promise<CampaignState> {
    const campaignRef = this.db.collection('campaigns').doc(campaignId);
    const viewRef = this.db.collection('campaignViews').doc(campaignId);
    const presence = { playerId, sessionId, lastSeenAt: now.toISOString() };
    await Promise.all([
      campaignRef.update({ [`presence.${playerId}`]: presence }),
      viewRef.update({ [`presence.${playerId}`]: presence }),
    ]);
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found.');
    return campaign;
  }

  async updateContentSettings(
    campaignId: string,
    settings: ContentSettings,
  ): Promise<CampaignState> {
    const campaignRef = this.db.collection('campaigns').doc(campaignId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(campaignRef);
      if (!snapshot.exists) throw new Error('Campaign not found.');
      const campaign = CampaignStateSchema.parse(snapshot.data());
      const updated: CampaignState = {
        ...campaign,
        contentSettings: settings,
        updatedAt: new Date().toISOString(),
        version: campaign.version + 1,
      };
      transaction.set(campaignRef, updated);
      transaction.set(this.db.collection('campaignViews').doc(campaignId), toCampaignView(updated));
      return updated;
    });
  }

  async claimAction(
    campaignId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<boolean> {
    const id = createHash('sha256').update(`${campaignId}:${expectedVersion}`).digest('hex');
    const campaignRef = this.db.collection('campaigns').doc(campaignId);
    const claimRef = this.db.collection('actionClaims').doc(id);
    return this.db.runTransaction(async (transaction) => {
      const [campaign, claim] = await Promise.all([
        transaction.get(campaignRef),
        transaction.get(claimRef),
      ]);
      if (!campaign.exists || (campaign.data() as CampaignState).version !== expectedVersion) {
        return false;
      }
      if (claim.exists) return false;
      transaction.create(claimRef, {
        campaignId,
        expectedVersion,
        idempotencyKey,
        createdAt: new Date().toISOString(),
      });
      return true;
    });
  }

  async releaseAction(
    campaignId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<void> {
    const id = createHash('sha256').update(`${campaignId}:${expectedVersion}`).digest('hex');
    const ref = this.db.collection('actionClaims').doc(id);
    await this.db.runTransaction(async (transaction) => {
      const claim = await transaction.get(ref);
      if (claim.data()?.idempotencyKey === idempotencyKey) transaction.delete(ref);
    });
  }

  async claimSceneArt(campaignId: string): Promise<CampaignState | null> {
    const campaignRef = this.db.collection('campaigns').doc(campaignId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(campaignRef);
      if (!snapshot.exists) return null;
      const campaign = CampaignStateSchema.parse(snapshot.data());
      if (
        !campaign.currentUi.artNeeded ||
        campaign.artGenerationsThisChapter >= ART_GENERATIONS_PER_CHAPTER
      )
        return null;
      const id = createHash('sha256')
        .update(`${campaignId}:chapter:${campaign.chapterNumber}`)
        .digest('hex');
      const claimRef = this.db.collection('artClaims').doc(id);
      const claim = await transaction.get(claimRef);
      if (claim.exists) return null;
      transaction.create(claimRef, {
        campaignId,
        expectedVersion: campaign.version,
        chapterNumber: campaign.chapterNumber,
        createdAt: new Date().toISOString(),
      });
      return campaign;
    });
  }

  async releaseSceneArt(campaignId: string, chapterNumber: number): Promise<void> {
    const id = createHash('sha256').update(`${campaignId}:chapter:${chapterNumber}`).digest('hex');
    await this.db.collection('artClaims').doc(id).delete();
  }

  async commitTransition(params: {
    previous: CampaignState;
    next: CampaignState;
    turn?: TurnRecord;
    memories?: StoredMemory[];
  }): Promise<CampaignState> {
    const campaignRef = this.db.collection('campaigns').doc(params.previous.id);
    await this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(campaignRef);
      if (
        !current.exists ||
        (current.data() as CampaignState).version !== params.previous.version
      ) {
        throw new Error('Campaign changed while this action was being resolved.');
      }
      transaction.create(
        this.db
          .collection('worldSnapshots')
          .doc(`${params.previous.id}_${params.previous.version}`),
        params.previous,
      );
      transaction.set(campaignRef, params.next);
      transaction.set(
        this.db.collection('campaignViews').doc(params.next.id),
        toCampaignView(params.next),
      );
      if (params.turn) {
        transaction.create(this.db.collection('turns').doc(params.turn.id), params.turn);
      }
      for (const memory of params.memories ?? []) {
        transaction.create(this.db.collection('memories').doc(memory.id), {
          ...memory,
          embedding: memory.embedding ? FieldValue.vector(memory.embedding) : null,
        });
      }
    });
    return params.next;
  }

  async rewind(campaignId: string): Promise<CampaignState> {
    const campaignRef = this.db.collection('campaigns').doc(campaignId);
    return this.db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(campaignRef);
      if (!currentSnapshot.exists) throw new Error('Campaign not found.');
      const current = currentSnapshot.data() as CampaignState;
      const snapshotRef = this.db
        .collection('worldSnapshots')
        .doc(`${campaignId}_${current.version - 1}`);
      const previousSnapshot = await transaction.get(snapshotRef);
      if (!previousSnapshot.exists) throw new Error('There is no previous turn to rewind.');
      const previous = CampaignStateSchema.parse(previousSnapshot.data());
      const discardedTurn = current.recentTurns.at(-1);
      const discardedMemories = discardedTurn
        ? await transaction.get(
            this.db.collection('memories').where('turnId', '==', discardedTurn.id),
          )
        : null;
      const rewound = {
        ...previous,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      transaction.set(campaignRef, rewound);
      transaction.set(this.db.collection('campaignViews').doc(campaignId), toCampaignView(rewound));
      if (discardedTurn) {
        transaction.delete(this.db.collection('turns').doc(discardedTurn.id));
        const claimId = createHash('sha256')
          .update(`${campaignId}:${current.version - 1}`)
          .digest('hex');
        transaction.delete(this.db.collection('actionClaims').doc(claimId));
      }
      for (const memory of discardedMemories?.docs ?? []) transaction.delete(memory.ref);
      return rewound;
    });
  }

  async setSceneArt(
    campaignId: string,
    chapterNumber: number,
    url: string,
  ): Promise<CampaignState> {
    const claimId = createHash('sha256')
      .update(`${campaignId}:chapter:${chapterNumber}`)
      .digest('hex');
    const campaignRef = this.db.collection('campaigns').doc(campaignId);
    const claimRef = this.db.collection('artClaims').doc(claimId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(campaignRef);
      if (!snapshot.exists) throw new Error('Campaign not found.');
      const campaign = CampaignStateSchema.parse(snapshot.data());
      transaction.delete(claimRef);
      if (
        campaign.chapterNumber !== chapterNumber ||
        campaign.artGenerationsThisChapter >= ART_GENERATIONS_PER_CHAPTER
      )
        return campaign;
      const updated: CampaignState = {
        ...campaign,
        currentUi: { ...campaign.currentUi, sceneArtUrl: url, artNeeded: false },
        artGenerationsThisChapter: Math.min(
          ART_GENERATIONS_PER_CHAPTER,
          campaign.artGenerationsThisChapter + 1,
        ),
        updatedAt: new Date().toISOString(),
        version: campaign.version + 1,
      };
      transaction.set(campaignRef, updated);
      transaction.set(this.db.collection('campaignViews').doc(campaignId), toCampaignView(updated));
      return updated;
    });
  }

  async getMemories(campaignId: string, limit: number): Promise<StoredMemory[]> {
    const snapshot = await this.db
      .collection('memories')
      .where('campaignId', '==', campaignId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => this.memoryFromDocument(doc.data())).reverse();
  }

  async getSimilarMemories(
    campaignId: string,
    queryVector: number[],
    limit: number,
  ): Promise<StoredMemory[]> {
    const snapshot = await this.db
      .collection('memories')
      .where('campaignId', '==', campaignId)
      .findNearest({
        vectorField: 'embedding',
        queryVector,
        limit,
        distanceMeasure: 'COSINE',
      })
      .get();
    return snapshot.docs.map((doc) => this.memoryFromDocument(doc.data()));
  }

  async getFamilyPatterns(familyId: string, limit: number): Promise<StoredMemory[]> {
    const snapshot = await this.db
      .collection('storyTemplates')
      .where('familyId', '==', familyId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => this.memoryFromDocument(doc.data())).reverse();
  }

  async saveFeedback(
    campaignId: string,
    player: AuthenticatedPlayer,
    feedback: ChapterFeedback,
  ): Promise<void> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) return;
    const feedbackId = `${campaignId}_${campaign.chapterNumber}_${player.id}`;
    await this.db
      .collection('chapterFeedback')
      .doc(feedbackId)
      .set({
        campaignId,
        familyId: player.familyId,
        playerId: player.id,
        chapterNumber: campaign.chapterNumber,
        ...feedback,
        createdAt: new Date().toISOString(),
      });
    const ratings = await this.db
      .collection('chapterFeedback')
      .where('campaignId', '==', campaignId)
      .where('chapterNumber', '==', campaign.chapterNumber)
      .get();
    const positivePlayers = new Set(
      ratings.docs
        .map((doc) => doc.data() as { playerId: string; rating: ChapterFeedback['rating'] })
        .filter((item) => item.rating === 'loved_it' || item.rating === 'okay')
        .map((item) => item.playerId),
    );
    if (positivePlayers.size === 2 && campaign.turnsInChapter >= 10) {
      const pattern = this.chapterPattern(campaign);
      await this.db.collection('storyTemplates').doc(pattern.id).set(pattern);
    }
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    const batch = this.db.batch();
    batch.delete(this.db.collection('campaigns').doc(campaignId));
    batch.delete(this.db.collection('campaignViews').doc(campaignId));
    batch.set(this.db.collection('deletionQueue').doc(campaignId), {
      campaignId,
      requestedAt: new Date().toISOString(),
      purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
    });
    await batch.commit();
  }

  async findDueDeletions(now: Date, limit: number): Promise<string[]> {
    const snapshot = await this.db
      .collection('deletionQueue')
      .where('purgeAfter', '<=', now.toISOString())
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => (doc.data() as { campaignId: string }).campaignId);
  }

  async purgeCampaignRecords(campaignId: string): Promise<void> {
    const writer = this.db.bulkWriter();
    const queries = [
      this.db.collection('turns').where('campaignId', '==', campaignId),
      this.db.collection('memories').where('campaignId', '==', campaignId),
      this.db.collection('chapterFeedback').where('campaignId', '==', campaignId),
      this.db.collection('storyTemplates').where('campaignId', '==', campaignId),
      this.db.collection('worldSnapshots').where('id', '==', campaignId),
      this.db.collection('actionClaims').where('campaignId', '==', campaignId),
      this.db.collection('assets').where('campaignId', '==', campaignId),
    ];
    for (const query of queries) {
      const snapshot = await query.get();
      for (const document of snapshot.docs) writer.delete(document.ref);
    }
    writer.delete(this.db.collection('campaigns').doc(campaignId));
    writer.delete(this.db.collection('campaignViews').doc(campaignId));
    writer.delete(this.db.collection('deletionQueue').doc(campaignId));
    await writer.close();
  }

  private memoryFromDocument(data: DocumentData): StoredMemory {
    return { ...(data as Omit<StoredMemory, 'embedding'>), embedding: null };
  }

  private chapterPattern(campaign: CampaignState): StoredMemory {
    const rollTraits = [
      ...new Set(campaign.recentTurns.flatMap((turn) => turn.rolls.map((roll) => roll.trait))),
    ];
    return {
      id: `pattern-${campaign.id}-${campaign.chapterNumber}`,
      campaignId: campaign.id,
      familyId: campaign.familyId,
      chapterNumber: campaign.chapterNumber,
      turnId: `pattern-${campaign.id}-${campaign.chapterNumber}`,
      createdAt: new Date().toISOString(),
      kind: 'pattern',
      importance: 4,
      text: `A ${campaign.turnsInChapter}-turn chapter worked well with a ${campaign.world.mood.replace('_', ' ')} mood, ${rollTraits.join(', ') || 'roleplay'} challenges, ${campaign.world.characters.length} friendly NPC roles, and a ${campaign.currentUi.mood === 'triumph' ? 'celebratory rest' : 'gentle cliffhanger'} ending.`,
      embedding: null,
    };
  }
}

export { familyCodeHash };
