import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!emulatorAvailable)('family-isolated Firestore rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    const rulesPath = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));
    environment = await initializeTestEnvironment({
      projectId: 'family-adventure-rules-test',
      firestore: { rules: await readFile(rulesPath, 'utf8') },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'profiles/parent-a'), { familyId: 'family-a', role: 'parent' });
      await setDoc(doc(db, 'profiles/child-a'), { familyId: 'family-a', role: 'child' });
      await setDoc(doc(db, 'profiles/child-a2'), { familyId: 'family-a', role: 'child' });
      await setDoc(doc(db, 'profiles/parent-b'), { familyId: 'family-b', role: 'parent' });
      await setDoc(doc(db, 'campaignViews/campaign-a'), {
        familyId: 'family-a',
        title: 'A',
        playerOrder: ['parent-a', 'child-a'],
      });
      await setDoc(doc(db, 'campaignViews/campaign-b'), {
        familyId: 'family-b',
        title: 'B',
        playerOrder: ['parent-b', 'child-b'],
      });
      await setDoc(doc(db, 'campaigns/campaign-a'), {
        familyId: 'family-a',
        gmBible: { secret: 'hidden' },
      });
    });
  });

  afterAll(async () => environment.cleanup());

  it('rejects unauthenticated and cross-family campaign reads', async () => {
    const guest = environment.unauthenticatedContext().firestore();
    const familyA = environment.authenticatedContext('parent-a').firestore();
    await assertFails(getDoc(doc(guest, 'campaignViews/campaign-a')));
    await assertFails(getDoc(doc(familyA, 'campaignViews/campaign-b')));
  });

  it('allows parent and child to read only their redacted family view', async () => {
    const parent = environment.authenticatedContext('parent-a').firestore();
    const child = environment.authenticatedContext('child-a').firestore();
    await assertSucceeds(getDoc(doc(parent, 'campaignViews/campaign-a')));
    await assertSucceeds(getDoc(doc(child, 'campaignViews/campaign-a')));
  });

  it('hides campaigns from a family child who was not selected to play', async () => {
    const unselectedChild = environment.authenticatedContext('child-a2').firestore();
    await assertFails(getDoc(doc(unselectedChild, 'campaignViews/campaign-a')));
  });

  it('denies browser writes and all reads of canonical GM state', async () => {
    const parent = environment.authenticatedContext('parent-a').firestore();
    const child = environment.authenticatedContext('child-a').firestore();
    await assertFails(setDoc(doc(parent, 'campaignViews/campaign-a'), { familyId: 'family-a' }));
    await assertFails(
      setDoc(doc(child, 'profiles/child-a'), { familyId: 'family-a', role: 'parent' }),
    );
    await assertFails(getDoc(doc(parent, 'campaigns/campaign-a')));
  });
});
