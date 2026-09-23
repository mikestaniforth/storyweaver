import { Compass, KeyRound, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getFirebaseServices } from '../lib/firebase';
import { useAuth } from '../lib/auth';

export function AuthScreen() {
  const { signInParent, signInChild } = useAuth();
  const [mode, setMode] = useState<'choose' | 'child'>('choose');
  const [familyCode, setFamilyCode] = useState(getFirebaseServices() ? '' : 'STARLIGHT');
  const [pin, setPin] = useState(getFirebaseServices() ? '' : '2468');
  const [adventurerName, setAdventurerName] = useState(getFirebaseServices() ? '' : 'Rowan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parentLogin() {
    setBusy(true);
    setError(null);
    try {
      await signInParent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in did not work.');
      setBusy(false);
    }
  }

  async function childLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInChild(familyCode, pin, adventurerName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in did not work.');
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-sky" aria-hidden="true">
        <span className="auth-moon" />
        {Array.from({ length: 18 }, (_, index) => (
          <i key={index} style={{ '--star': index } as React.CSSProperties} />
        ))}
      </div>
      <section className="auth-story">
        <div className="brand-mark">
          <Compass size={30} />
        </div>
        <p className="eyebrow">Storyweaver · A shared adventure</p>
        <h1>
          Every evening can open a <em>new door.</em>
        </h1>
        <p className="auth-lede">
          Take turns, roll the dice, and build an adventure that remembers every brave, clever, and
          kind choice you make together.
        </p>
        <div className="promise-row">
          <span>
            <ShieldCheck size={18} /> Private by design
          </span>
          <span>
            <UsersRound size={18} /> Two or three players together
          </span>
          <span>
            <Sparkles size={18} /> A story that grows
          </span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="signin-heading">
        {mode === 'choose' ? (
          <>
            <p className="card-kicker">Welcome, adventurer</p>
            <h2 id="signin-heading">Who is entering the story?</h2>
            <button
              className="role-choice parent-choice"
              onClick={() => void parentLogin()}
              disabled={busy}
            >
              <span className="role-avatar">🛡️</span>
              <span>
                <strong>I’m the parent</strong>
                <small>Manage and join family adventures</small>
              </span>
              <span className="choice-arrow">→</span>
            </button>
            <button
              className="role-choice child-choice"
              onClick={() => setMode('child')}
              disabled={busy}
            >
              <span className="role-avatar">🦊</span>
              <span>
                <strong>I’m the young adventurer</strong>
                <small>Use the family code and secret PIN</small>
              </span>
              <span className="choice-arrow">→</span>
            </button>
            {!getFirebaseServices() && (
              <p className="demo-note">
                <Sparkles size={15} /> Local demo is ready — open another tab for the second player.
              </p>
            )}
          </>
        ) : (
          <form onSubmit={(event) => void childLogin(event)}>
            <button className="back-button" type="button" onClick={() => setMode('choose')}>
              ← Back
            </button>
            <p className="card-kicker">Young adventurer</p>
            <h2 id="signin-heading">Enter your family keys</h2>
            <label>
              Your adventure name
              <div className="input-with-icon">
                <UserRound size={18} />
                <input
                  value={adventurerName}
                  onChange={(event) => setAdventurerName(event.target.value)}
                  autoComplete="nickname"
                  maxLength={30}
                  placeholder="Linc or Wren"
                  required
                />
              </div>
            </label>
            <label>
              Family code
              <div className="input-with-icon">
                <Compass size={18} />
                <input
                  value={familyCode}
                  onChange={(event) => setFamilyCode(event.target.value.toUpperCase())}
                  autoComplete="off"
                  maxLength={20}
                  required
                />
              </div>
            </label>
            <label>
              Secret PIN
              <div className="input-with-icon">
                <KeyRound size={18} />
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  minLength={4}
                  maxLength={8}
                  required
                />
              </div>
            </label>
            <button className="primary-button full-button" disabled={busy}>
              {busy ? 'Opening the gate…' : 'Enter the adventure'}
            </button>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
