import {
  GoogleAuthProvider,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { currentAppCheckToken, getFirebaseServices } from './firebase';

export type SessionRole = 'parent' | 'child';

export interface Session {
  uid: string;
  displayName: string;
  role: SessionRole;
  token: string;
  local: boolean;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInParent: () => Promise<void>;
  signInChild: (familyCode: string, pin: string, adventurerName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LOCAL_SESSION_KEY = 'family-adventure-session';

function readLocalSession(): Session | null {
  try {
    const value = localStorage.getItem(LOCAL_SESSION_KEY);
    return value ? (JSON.parse(value) as Session) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const firebase = getFirebaseServices();
    if (!firebase) {
      setSession(readLocalSession());
      setLoading(false);
      return;
    }
    return onAuthStateChanged(firebase.auth, (user) => {
      void (async () => {
        if (!user) {
          setSession(null);
          setLoading(false);
          return;
        }
        const tokenResult = await getIdTokenResult(user);
        const role: SessionRole = tokenResult.claims.role === 'child' ? 'child' : 'parent';
        setSession({
          uid: user.uid,
          displayName: user.displayName ?? (role === 'parent' ? 'Parent' : 'Adventurer'),
          role,
          token: tokenResult.token,
          local: false,
        });
        setLoading(false);
      })();
    });
  }, []);

  const saveLocal = useCallback((next: Session | null) => {
    if (next) localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(LOCAL_SESSION_KEY);
    setSession(next);
  }, []);

  const signInParent = useCallback(async () => {
    const firebase = getFirebaseServices();
    if (firebase) {
      await signInWithPopup(firebase.auth, new GoogleAuthProvider());
      return;
    }
    saveLocal({
      uid: 'demo-parent',
      displayName: 'Dad',
      role: 'parent',
      token: 'demo-parent',
      local: true,
    });
  }, [saveLocal]);

  const signInChild = useCallback(
    async (familyCode: string, pin: string, adventurerName?: string) => {
      const appCheck = await currentAppCheckToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/auth/child-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}),
        },
        body: JSON.stringify({ familyCode, pin, adventurerName: adventurerName || undefined }),
      });
      const body = (await response.json()) as {
        customToken?: string;
        player?: { id: string; displayName: string };
        error?: { message: string };
      };
      if (!response.ok || !body.customToken || !body.player) {
        throw new Error(body.error?.message ?? 'The family code or PIN was not recognised.');
      }
      const firebase = getFirebaseServices();
      if (firebase && !body.customToken.startsWith('demo-')) {
        await signInWithCustomToken(firebase.auth, body.customToken);
        return;
      }
      saveLocal({
        uid: body.player.id,
        displayName: body.player.displayName,
        role: 'child',
        token: body.customToken,
        local: true,
      });
    },
    [saveLocal],
  );

  const signOut = useCallback(async () => {
    const firebase = getFirebaseServices();
    if (firebase?.auth.currentUser) await firebaseSignOut(firebase.auth);
    saveLocal(null);
  }, [saveLocal]);

  const getToken = useCallback(async () => {
    const firebase = getFirebaseServices();
    if (firebase?.auth.currentUser) return firebase.auth.currentUser.getIdToken();
    return session?.token ?? null;
  }, [session]);

  const value = useMemo(
    () => ({ session, loading, signInParent, signInChild, signOut, getToken }),
    [session, loading, signInParent, signInChild, signOut, getToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
