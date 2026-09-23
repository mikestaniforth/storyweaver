import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken as getAppCheckToken,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, type Firestore } from 'firebase/firestore';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  appCheck: AppCheck | null;
}

let services: FirebaseServices | null | undefined;

function env(name: keyof ImportMetaEnv): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getFirebaseServices(): FirebaseServices | null {
  if (services !== undefined) return services;
  const apiKey = env('VITE_FIREBASE_API_KEY');
  const projectId = env('VITE_FIREBASE_PROJECT_ID');
  if (!apiKey || !projectId) {
    services = null;
    return services;
  }
  const authDomain = env('VITE_FIREBASE_AUTH_DOMAIN');
  const storageBucket = env('VITE_FIREBASE_STORAGE_BUCKET');
  const appId = env('VITE_FIREBASE_APP_ID');
  const app = initializeApp({
    apiKey,
    projectId,
    ...(authDomain ? { authDomain } : {}),
    ...(storageBucket ? { storageBucket } : {}),
    ...(appId ? { appId } : {}),
  });
  const siteKey = env('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY');
  let appCheck: AppCheck | null = null;
  if (siteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  services = { app, auth: getAuth(app), firestore: getFirestore(app), appCheck };
  return services;
}

export async function currentAppCheckToken(): Promise<string | null> {
  const appCheck = getFirebaseServices()?.appCheck;
  if (!appCheck) return null;
  return (await getAppCheckToken(appCheck, false)).token;
}

export function subscribeToCampaignView(
  campaignId: string,
  onChange: () => void,
): (() => void) | null {
  const firestore = getFirebaseServices()?.firestore;
  if (!firestore) return null;
  return onSnapshot(doc(firestore, 'campaignViews', campaignId), onChange, () => undefined);
}
