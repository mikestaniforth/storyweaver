import type { CampaignView, CreateCampaignInput, PlayerProfile } from '@family-adventure/shared';
import {
  BookOpen,
  Compass,
  Copy,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '../lib/auth';
import type { ApiClient, BootstrapData } from '../lib/api';

interface DashboardProps {
  session: Session;
  api: ApiClient;
  onOpenCampaign: (id: string) => void;
  onSignOut: () => Promise<void>;
}

const archetypes: Array<{ id: PlayerProfile['archetype']; label: string; emoji: string }> = [
  { id: 'scout', label: 'Quick Scout', emoji: '🦊' },
  { id: 'inventor', label: 'Bright Inventor', emoji: '🧰' },
  { id: 'storykeeper', label: 'Wise Storykeeper', emoji: '📚' },
  { id: 'guardian', label: 'Kind Guardian', emoji: '🛡️' },
];

export function Dashboard({ session, api, onOpenCampaign, onSignOut }: DashboardProps) {
  const [campaigns, setCampaigns] = useState<CampaignView[]>([]);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Bootstrap creates the parent's profile on first sign-in. Do this before
      // authenticated campaign reads so a brand-new family cannot race itself.
      const family = session.role === 'parent' ? await api.bootstrap() : null;
      const campaignList = await api.listCampaigns();
      setCampaigns(campaignList);
      setBootstrap(family);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The library could not be opened.');
    } finally {
      setBusy(false);
    }
  }, [api, session.role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const pin = form.get('pin');
    try {
      const result = await api.createChildProfile({
        displayName: String(form.get('displayName')),
        archetype: String(form.get('archetype')) as PlayerProfile['archetype'],
        avatar: String(form.get('avatar')),
        ...(pin ? { pin: String(pin) } : {}),
      });
      setBootstrap(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The profile could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const input: CreateCampaignInput = {
      title: String(form.get('title')),
      premise: String(form.get('premise')),
      playerIds: [
        bootstrap?.profiles.find((profile) => profile.role === 'parent')?.id ?? session.uid,
        ...form.getAll('playerIds').map(String),
      ],
      contentSettings: {
        toneProfile: 'family_spooky',
        spookiness: Number(form.get('spookiness')),
        combatIntensity: Number(form.get('combatIntensity')),
        language: String(
          form.get('language'),
        ) as CreateCampaignInput['contentSettings']['language'],
        permanentCharacterDeath: String(
          form.get('permanentCharacterDeath'),
        ) as CreateCampaignInput['contentSettings']['permanentCharacterDeath'],
      },
    };
    try {
      const campaign = await api.createCampaign(input);
      setCreating(false);
      onOpenCampaign(campaign.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The campaign could not be created.');
      setBusy(false);
    }
  }

  async function rotateFamilyCode() {
    if (
      !window.confirm(
        'Rotate the family code and sign the young adventurer out of existing production sessions?',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setBootstrap(await api.rotateFamilyCode());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The family code could not be rotated.');
    } finally {
      setBusy(false);
    }
  }

  const childProfiles = bootstrap?.profiles.filter((profile) => profile.role === 'child') ?? [];
  const parentProfile = bootstrap?.profiles.find((profile) => profile.role === 'parent');

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="wordmark">
          <span>
            <Compass size={22} />
          </span>{' '}
          Storyweaver
        </div>
        <div className="header-player">
          <span>{session.role === 'parent' ? '🛡️' : '🦊'}</span>
          <div>
            <strong>{session.displayName}</strong>
            <small>{session.role === 'parent' ? 'Parent adventurer' : 'Young adventurer'}</small>
          </div>
          <button className="icon-button" onClick={() => void onSignOut()} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="dashboard-intro">
        <p className="eyebrow">Your story shelf</p>
        <h1>Good evening, {session.displayName}.</h1>
        <p>
          {session.role === 'parent'
            ? 'A little wonder is waiting for your family.'
            : 'Your shared adventures are waiting for the other heroes.'}
        </p>
      </section>

      {error && (
        <p className="dashboard-error" role="alert">
          {error}
        </p>
      )}

      {session.role === 'parent' && bootstrap && childProfiles.length < 2 && (
        <section className="setup-panel">
          <div className="setup-copy">
            <span className="large-icon">
              <Users />
            </span>
            <p className="eyebrow">
              {childProfiles.length === 0 ? 'One-time setup' : 'Grow the party'}
            </p>
            <h2>
              {childProfiles.length === 0
                ? 'Create the young adventurer'
                : 'Add another adventurer'}
            </h2>
            <p>
              No email, birthday, photo, or real name is needed. A nickname and family PIN are
              enough.
            </p>
            {childProfiles.length > 0 && (
              <div className="family-player-list">
                {childProfiles.map((profile) => (
                  <span key={profile.id}>
                    {profile.avatar} {profile.displayName}
                  </span>
                ))}
              </div>
            )}
            <div className="privacy-chip">
              <ShieldCheck size={16} /> Parent-managed and private
            </div>
          </div>
          <form className="setup-form" onSubmit={(event) => void createChild(event)}>
            <label>
              Adventure name
              <input
                name="displayName"
                placeholder={childProfiles.length === 0 ? 'Linc' : 'Wren'}
                maxLength={30}
                required
              />
            </label>
            <label>
              Choose a hero style
              <select name="archetype" defaultValue="scout">
                {archetypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.emoji} {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Choose an avatar
              <select name="avatar" defaultValue="🦊">
                <option>🦊</option>
                <option>🐉</option>
                <option>🦉</option>
                <option>🐻</option>
                <option>🦁</option>
              </select>
            </label>
            {childProfiles.length === 0 && (
              <label>
                Family PIN
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  placeholder="4–8 digits"
                  pattern="\d{4,8}"
                  required
                />
              </label>
            )}
            <button className="primary-button" disabled={busy}>
              Create adventurer
            </button>
          </form>
        </section>
      )}

      {session.role === 'parent' && childProfiles.length > 0 && bootstrap && (
        <section className="family-key-card">
          <div>
            <p className="eyebrow">Family key</p>
            <strong>{bootstrap.family.familyCode}</strong>
            <small>
              Share this, the family PIN, and each player’s adventure name only with your young
              adventurers.
            </small>
          </div>
          <div className="family-key-actions">
            <button
              className="secondary-button"
              onClick={() => void navigator.clipboard.writeText(bootstrap.family.familyCode)}
            >
              <Copy size={16} /> Copy code
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void rotateFamilyCode()}
            >
              <RefreshCw size={16} /> Rotate & revoke
            </button>
          </div>
        </section>
      )}

      <section className="campaign-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Campaigns</p>
            <h2>Adventures in progress</h2>
          </div>
          {session.role === 'parent' && childProfiles.length > 0 && (
            <button className="primary-button" onClick={() => setCreating(true)}>
              <Plus size={17} /> New adventure
            </button>
          )}
        </div>
        {busy && campaigns.length === 0 ? (
          <div className="loading-card">
            <Sparkles /> Opening the story shelf…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="empty-shelf">
            <BookOpen size={38} />
            <h3>Your first adventure begins here</h3>
            <p>Create a world that only your chosen family party can change.</p>
          </div>
        ) : (
          <div className="campaign-grid">
            {campaigns.map((campaign) => (
              <button
                className={`campaign-card theme-${campaign.currentUi.theme}`}
                key={campaign.id}
                onClick={() => onOpenCampaign(campaign.id)}
              >
                <div className="campaign-art">
                  <span>{campaign.world.characters[0]?.avatar ?? '✨'}</span>
                  <i />
                </div>
                <div className="campaign-card-copy">
                  <small>
                    Chapter {campaign.chapterNumber} · {campaign.status.replace('_', ' ')}
                  </small>
                  <h3>{campaign.title}</h3>
                  <p>{campaign.world.location}</p>
                  <div>
                    {campaign.players.map((player) => (
                      <span key={player.id} title={player.displayName}>
                        {player.avatar}
                      </span>
                    ))}
                    <em>{campaign.totalTurns} turns</em>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {creating && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Create a new adventure"
        >
          <form className="campaign-modal" onSubmit={(event) => void createCampaign(event)}>
            <button type="button" className="modal-close" onClick={() => setCreating(false)}>
              ×
            </button>
            <p className="eyebrow">New adventure</p>
            <h2>What world shall we enter?</h2>
            <fieldset className="party-picker">
              <legend>Who is playing this adventure?</legend>
              {parentProfile && (
                <label>
                  <input type="checkbox" checked disabled readOnly />
                  <span>{parentProfile.avatar}</span>
                  <strong>{parentProfile.displayName}</strong>
                  <small>Parent</small>
                </label>
              )}
              {childProfiles.map((profile) => (
                <label key={profile.id}>
                  <input type="checkbox" name="playerIds" value={profile.id} defaultChecked />
                  <span>{profile.avatar}</span>
                  <strong>{profile.displayName}</strong>
                  <small>Adventurer</small>
                </label>
              ))}
              <p>Select one child for a two-player story, or both for a three-player story.</p>
            </fieldset>
            <label>
              Campaign title
              <input
                name="title"
                defaultValue="The Clockwork Moon"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label>
              Your starting idea
              <textarea
                name="premise"
                defaultValue="A tiny moon has fallen into the hills, and its clockwork animals need our help finding the way home."
                minLength={10}
                maxLength={500}
                rows={4}
                required
              />
            </label>
            <div className="slider-grid">
              <label>
                Fear
                <select name="spookiness" defaultValue="2">
                  <option value="0">Cosy</option>
                  <option value="1">Mysterious</option>
                  <option value="2">Spooky</option>
                  <option value="3">Intense</option>
                </select>
              </label>
              <label>
                Action
                <select name="combatIntensity" defaultValue="1">
                  <option value="0">Puzzles only</option>
                  <option value="1">Cinematic adventure</option>
                  <option value="2">Heroic action</option>
                </select>
              </label>
              <label>
                Language
                <select name="language" defaultValue="mild">
                  <option value="clean">Clean</option>
                  <option value="mild">Mild</option>
                </select>
              </label>
              <label>
                Character death
                <select name="permanentCharacterDeath" defaultValue="off">
                  <option value="off">Off</option>
                  <option value="story_only">Story only</option>
                </select>
              </label>
            </div>
            <p className="tone-note">
              Family Spooky allows supernatural suspense and meaningful danger, but never sexual
              content, graphic gore, or strong language.
            </p>
            <button className="primary-button full-button" disabled={busy}>
              <Sparkles size={17} /> {busy ? 'Dreaming up the world…' : 'Create our world'}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
