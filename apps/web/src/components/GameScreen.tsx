import {
  ART_GENERATIONS_PER_CHAPTER,
  PRESENCE_TTL_MS,
  type CampaignView,
  type ChapterFeedback,
  type ContentSettings,
  type PlayerProfile,
  type RollRecord,
} from '@family-adventure/shared';
import {
  ArrowLeft,
  Backpack,
  BookOpen,
  Check,
  Clock3,
  Dices,
  Download,
  Headphones,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Send,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Users,
  Volume2,
  WandSparkles,
  WifiOff,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { ApiClient } from '../lib/api';
import type { Session } from '../lib/auth';
import { subscribeToCampaignView } from '../lib/firebase';
import { MoodSoundtrack } from './MoodSoundtrack';

interface GameScreenProps {
  campaignId: string;
  session: Session;
  api: ApiClient;
  onBack: () => void;
}

const traitLabels: Record<keyof PlayerProfile['traits'], string> = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  heart: 'Heart',
};

const outcomeLabels: Record<RollRecord['outcome'], string> = {
  great_success: 'Great success!',
  success: 'Success!',
  success_with_complication: 'Success—with a twist',
  setback: 'A setback, but onward',
};

function isOnline(campaign: CampaignView, playerId: string, now = Date.now()): boolean {
  const presence = campaign.presence[playerId];
  return Boolean(presence && now - new Date(presence.lastSeenAt).getTime() <= PRESENCE_TTL_MS);
}

function PlayerSheet({
  player,
  online,
  active,
}: {
  player: PlayerProfile;
  online: boolean;
  active: boolean;
}) {
  return (
    <article className={`player-sheet ${active ? 'is-active' : ''}`}>
      <header>
        <span className="player-avatar">{player.avatar}</span>
        <div>
          <strong>{player.displayName}</strong>
          <small>
            {player.archetype} · {online ? 'online' : 'away'}
          </small>
        </div>
        <i
          className={`presence-dot ${online ? 'online' : ''}`}
          aria-label={online ? 'Online' : 'Away'}
        />
      </header>
      <div className="trait-row">
        {(Object.entries(player.traits) as Array<[keyof PlayerProfile['traits'], number]>).map(
          ([trait, value]) => (
            <div key={trait} title={traitLabels[trait]}>
              <span>{trait.slice(0, 1).toUpperCase()}</span>
              <strong>{value}</strong>
            </div>
          ),
        )}
      </div>
      <div className="sheet-detail">
        <Backpack size={15} />
        <span>
          {player.inventory.length
            ? player.inventory.join(' · ')
            : 'An empty pack, ready for treasure'}
        </span>
      </div>
      {player.conditions.length > 0 && (
        <div className="condition-list">
          {player.conditions.map((condition) => (
            <span key={condition}>{condition}</span>
          ))}
        </div>
      )}
      <div className={`special-move ${player.specialMoveAvailable ? '' : 'used'}`}>
        <Star size={14} /> {player.specialMove}
      </div>
    </article>
  );
}

function DiceResult({ roll }: { roll: RollRecord }) {
  return (
    <div className={`dice-result outcome-${roll.outcome}`}>
      <div className="d20" aria-label={`d20 rolled ${roll.die}`}>
        <span>{roll.die}</span>
      </div>
      <div>
        <small>
          {traitLabels[roll.trait]} check · difficulty {roll.dc}
        </small>
        <strong>
          {roll.die} + {roll.modifier} = {roll.total}
        </strong>
        <em>{outcomeLabels[roll.outcome]}</em>
      </div>
    </div>
  );
}

function AmbientEffect({ effect }: { effect: CampaignView['currentUi']['ambientEffect'] }) {
  if (effect === 'none') return null;
  return (
    <div className={`ambient ambient-${effect}`} aria-hidden="true">
      {Array.from({ length: effect === 'rain' ? 18 : 10 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

function PixelLandscape({ ui }: { ui: CampaignView['currentUi'] }) {
  return (
    <div className={`pixel-landscape pixel-${ui.theme} visual-${ui.visualMood}`} aria-hidden="true">
      <div className="pixel-sky" />
      <div className="pixel-orb" />
      <div className="pixel-cloud pixel-cloud-one" />
      <div className="pixel-cloud pixel-cloud-two" />
      <div className="pixel-ridge pixel-ridge-far" />
      <div className="pixel-ridge pixel-ridge-near" />
      <div className="pixel-landmark" />
      <div className="pixel-ground" />
      <div className="pixel-weather" />
    </div>
  );
}

function ToneControls({
  settings,
  onSave,
}: {
  settings: ContentSettings;
  onSave: (settings: ContentSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(
    () => setDraft(settings),
    [
      settings.combatIntensity,
      settings.language,
      settings.permanentCharacterDeath,
      settings.spookiness,
      settings.toneProfile,
    ],
  );

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="tone-controls">
      <summary>
        <SlidersHorizontal size={14} /> Mood &amp; boundaries
      </summary>
      <div className="tone-control-grid">
        <label>
          Fear
          <select
            value={draft.spookiness}
            onChange={(event) => setDraft({ ...draft, spookiness: Number(event.target.value) })}
          >
            <option value="0">Cosy</option>
            <option value="1">Mysterious</option>
            <option value="2">Spooky</option>
            <option value="3">Intense</option>
          </select>
        </label>
        <label>
          Action
          <select
            value={draft.combatIntensity}
            onChange={(event) =>
              setDraft({ ...draft, combatIntensity: Number(event.target.value) })
            }
          >
            <option value="0">Puzzles</option>
            <option value="1">Cinematic</option>
            <option value="2">Heroic</option>
          </select>
        </label>
        <label>
          Language
          <select
            value={draft.language}
            onChange={(event) =>
              setDraft({ ...draft, language: event.target.value as ContentSettings['language'] })
            }
          >
            <option value="clean">Clean</option>
            <option value="mild">Mild</option>
          </select>
        </label>
        <label>
          Character death
          <select
            value={draft.permanentCharacterDeath}
            onChange={(event) =>
              setDraft({
                ...draft,
                permanentCharacterDeath: event.target
                  .value as ContentSettings['permanentCharacterDeath'],
              })
            }
          >
            <option value="off">Off</option>
            <option value="story_only">Story only</option>
          </select>
        </label>
      </div>
      <p>Family Spooky always excludes sexual content, graphic gore, and strong language.</p>
      <button type="button" disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save story tone'}
      </button>
    </details>
  );
}

export function GameScreen({ campaignId, session, api, onBack }: GameScreenProps) {
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [feedbackSent, setFeedbackSent] = useState<ChapterFeedback['rating'] | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [useSpecialMove, setUseSpecialMove] = useState(false);
  const sessionId = useRef(crypto.randomUUID());
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [campaignId]);
  const artAttempts = useRef(new Set<string>());

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        setCampaign(await api.getCampaign(campaignId));
      } catch (caught) {
        if (!silent)
          setError(caught instanceof Error ? caught.message : 'The adventure could not be opened.');
      }
    },
    [api, campaignId],
  );

  const heartbeat = useCallback(async () => {
    try {
      setCampaign(await api.presence(campaignId, sessionId.current));
    } catch {
      // Presence retries automatically; the visible online state will expire safely.
    }
  }, [api, campaignId]);

  useEffect(() => {
    void refresh();
    void heartbeat();
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 12_000);
    const refreshTimer = window.setInterval(() => void refresh(true), 4_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 3_000);
    const unsubscribe = subscribeToCampaignView(campaignId, () => void refresh(true));
    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      unsubscribe?.();
      window.speechSynthesis?.cancel();
    };
  }, [campaignId, heartbeat, refresh]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [campaign?.totalTurns]);

  useEffect(() => {
    if (!campaign || session.role !== 'parent' || !campaign.currentUi.artNeeded) return;
    if (
      campaign.artGenerationsThisChapter >= ART_GENERATIONS_PER_CHAPTER ||
      campaign.currentUi.sceneArtUrl
    )
      return;
    const key = `${campaign.chapterNumber}:${campaign.version}`;
    if (artAttempts.current.has(key)) return;
    artAttempts.current.add(key);
    void api
      .generateArt(campaign.id)
      .then(setCampaign)
      .catch(() => undefined);
  }, [api, campaign, session.role]);

  const playersOnline = useMemo(
    () => (campaign ? campaign.playerOrder.every((id) => isOnline(campaign, id, now)) : false),
    [campaign, now],
  );
  const myTurn = campaign?.status === 'active' && campaign.activePlayerId === session.uid;
  const activePlayer = campaign?.players.find((player) => player.id === campaign.activePlayerId);
  const currentPlayer = campaign?.players.find((player) => player.id === session.uid);
  const latestTurn = campaign?.recentTurns.at(-1);

  async function startChapter() {
    setBusy(true);
    setError(null);
    setFeedbackSent(null);
    try {
      setCampaign(await api.start(campaignId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The chapter could not begin.');
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    const text = action.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const next = await api.act(campaignId, text, idempotencyKey, useSpecialMove);
      setCampaign(next);
      setAction('');
      setUseSpecialMove(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The Game Master lost the thread for a moment.',
      );
      await refresh(true);
    } finally {
      setBusy(false);
    }
  }

  async function rewind() {
    if (
      !window.confirm(
        'Rewind the most recent turn? The action, roll, and story changes from that turn will be undone.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setCampaign(await api.rewind(campaignId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That moment could not be rewound.');
    } finally {
      setBusy(false);
    }
  }

  async function exportCampaign() {
    if (!campaign) return;
    setError(null);
    try {
      const blob = await api.exportCampaign(campaignId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The campaign could not be exported.');
    }
  }

  async function deleteCampaign() {
    if (
      !window.confirm(
        'Delete this campaign now? It disappears from active systems immediately and is queued for permanent purge.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteCampaign(campaignId);
      onBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The campaign could not be deleted.');
      setBusy(false);
    }
  }

  async function rateChapter(rating: ChapterFeedback['rating']) {
    setError(null);
    try {
      await api.feedback(campaignId, rating);
      setFeedbackSent(rating);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The rating could not be saved.');
    }
  }

  async function saveContentSettings(settings: ContentSettings) {
    setError(null);
    try {
      setCampaign(await api.updateContentSettings(campaignId, settings));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The story tone could not be saved.');
      throw caught;
    }
  }

  async function speakNarration() {
    if (!campaign) return;
    window.speechSynthesis?.cancel();
    setSpeaking(true);
    try {
      if (latestTurn) {
        const audio = await api.audio(latestTurn.id);
        if (audio) {
          const url = URL.createObjectURL(audio);
          const player = new Audio(url);
          player.onended = () => {
            URL.revokeObjectURL(url);
            setSpeaking(false);
          };
          player.onerror = () => {
            URL.revokeObjectURL(url);
            setSpeaking(false);
          };
          await player.play();
          return;
        }
      }
      const utterance = new SpeechSynthesisUtterance(campaign.lastNarration);
      utterance.rate = 0.94;
      utterance.pitch = 1.02;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }

  if (!campaign) {
    return (
      <main className="game-loading">
        <LoaderCircle className="spin" />
        <p>{error ?? 'Opening the storybook…'}</p>
        {error && (
          <button className="secondary-button" onClick={onBack}>
            Back to campaigns
          </button>
        )}
      </main>
    );
  }

  const sceneStyle = campaign.currentUi.sceneArtUrl
    ? ({ '--scene-image': `url("${campaign.currentUi.sceneArtUrl}")` } as CSSProperties)
    : undefined;

  return (
    <main
      className={`game-shell ${campaign.currentUi.sceneArtUrl ? 'has-world-art' : ''} theme-${campaign.currentUi.theme} mood-${campaign.currentUi.mood} time-${campaign.currentUi.timeOfDay} weather-${campaign.currentUi.weather} visual-${campaign.currentUi.visualMood}`}
      style={sceneStyle}
    >
      {campaign.currentUi.sceneArtUrl && (
        <div key={campaign.currentUi.sceneArtUrl} className="scene-backdrop" aria-hidden="true">
          <div />
        </div>
      )}
      <header className="game-topbar">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} /> Campaigns
        </button>
        <div className="game-title">
          <small>Chapter {campaign.chapterNumber}</small>
          <strong>{campaign.title}</strong>
        </div>
        <div className="topbar-actions">
          <MoodSoundtrack
            cue={campaign.currentUi.musicCue}
            intensity={campaign.currentUi.musicIntensity}
            ducked={speaking}
          />
          <div className={`together-status ${playersOnline ? 'ready' : ''}`}>
            {playersOnline ? <Users size={16} /> : <WifiOff size={16} />}
            {playersOnline ? 'Together' : 'Waiting'}
          </div>
        </div>
      </header>

      <section className={`scene-hero ${campaign.currentUi.sceneArtUrl ? 'has-scene-art' : ''}`}>
        <PixelLandscape ui={campaign.currentUi} />
        <AmbientEffect effect={campaign.currentUi.ambientEffect} />
        <div className="scene-symbols" aria-hidden="true">
          <span>✦</span>
          <span>☾</span>
          <span>✧</span>
        </div>
        <div className="scene-copy">
          <p>
            <MapPin size={15} /> {campaign.world.location}
          </p>
          <h1>{campaign.world.locationDescription}</h1>
          <div>
            <span>{campaign.currentUi.mood.replaceAll('_', ' ')}</span>
            <span>{campaign.currentUi.timeOfDay}</span>
            {campaign.currentUi.weather !== 'clear' && <span>{campaign.currentUi.weather}</span>}
            <span>{campaign.turnsInChapter}/10–14 turns</span>
          </div>
          <small className="scene-scroll-cue">Scroll to enter the scene</small>
        </div>
      </section>

      {error && (
        <div className="game-alert" role="alert">
          <Shield size={17} /> {error}
        </div>
      )}

      <div className="game-layout">
        <aside className="left-rail">
          <div className="rail-heading">
            <Users size={16} /> Adventurers
          </div>
          {campaign.players.map((player) => (
            <PlayerSheet
              key={player.id}
              player={player}
              online={isOnline(campaign, player.id, now)}
              active={campaign.activePlayerId === player.id}
            />
          ))}
          <section className="quest-card">
            <h3>
              <BookOpen size={16} /> Quest threads
            </h3>
            {campaign.world.quests.map((quest) => (
              <div key={quest.id} className={`quest-${quest.status}`}>
                <i>{quest.status === 'completed' ? <Check size={13} /> : '✦'}</i>
                <span>
                  <strong>{quest.title}</strong>
                  <small>{quest.description}</small>
                </span>
              </div>
            ))}
          </section>
        </aside>

        <section className="story-column">
          <div className="story-heading">
            <div>
              <span className="gm-seal">
                <WandSparkles size={17} />
              </span>
              <p>
                <small>Your Game Master</small>
                <strong>The Storyweaver</strong>
              </p>
            </div>
            <button
              className="listen-button"
              onClick={() => void speakNarration()}
              disabled={speaking}
            >
              {speaking ? <Volume2 className="pulse" size={16} /> : <Headphones size={16} />}
              {speaking ? 'Speaking…' : 'Listen'}
            </button>
          </div>

          <div className="transcript" aria-live="polite">
            <article className="gm-message opening-message">
              <p>
                {campaign.recentTurns.length === 0 ? campaign.lastNarration : 'Our story so far…'}
              </p>
            </article>
            {campaign.recentTurns.map((turn) => {
              const actor = campaign.players.find((player) => player.id === turn.playerId);
              return (
                <div className="turn-pair" key={turn.id}>
                  <article className="player-message">
                    <span>{actor?.avatar}</span>
                    <div>
                      <small>{actor?.displayName}</small>
                      <p>{turn.playerAction}</p>
                    </div>
                  </article>
                  {turn.rolls.map((roll) => (
                    <DiceResult key={roll.id} roll={roll} />
                  ))}
                  <article className="gm-message">
                    <p>{turn.narration}</p>
                  </article>
                </div>
              );
            })}
            {busy && (
              <div className="thinking">
                <Sparkles size={16} />
                <span>The Storyweaver considers what happens next</span>
                <i />
                <i />
                <i />
              </div>
            )}
            <div ref={transcriptEnd} />
          </div>

          {campaign.status === 'lobby' && (
            <section className="lobby-panel">
              <span className="lobby-icon">
                <Users />
              </span>
              <div>
                <p className="eyebrow">At the story gate</p>
                <h2>The whole party begins together</h2>
                <p>
                  {playersOnline
                    ? 'Everyone is here. The parent can open the first page.'
                    : `Open this campaign for every selected player. The story waits safely until all ${campaign.players.length} heroes are online.`}
                </p>
              </div>
              {session.role === 'parent' ? (
                <button
                  className="primary-button"
                  disabled={!playersOnline || busy}
                  onClick={() => void startChapter()}
                >
                  <Sparkles size={17} /> Begin chapter
                </button>
              ) : (
                <div className="waiting-chip">
                  <Clock3 size={15} /> Waiting for the parent
                </div>
              )}
            </section>
          )}

          {campaign.status === 'active' && (
            <section className={`action-dock ${myTurn ? 'your-turn' : ''}`}>
              {!playersOnline ? (
                <div className="paused-message">
                  <WifiOff size={20} />
                  <div>
                    <strong>Story paused safely</strong>
                    <span>
                      Every adventurer in this campaign must be online before anything can change.
                    </span>
                  </div>
                </div>
              ) : !myTurn ? (
                <div className="waiting-turn">
                  <span>{activePlayer?.avatar}</span>
                  <div>
                    <strong>{activePlayer?.displayName} has the spotlight</strong>
                    <small>You can read along while they choose.</small>
                  </div>
                  <i className="turn-pulse" />
                </div>
              ) : (
                <>
                  <div className="turn-banner">
                    <Sparkles size={16} />
                    <strong>Your turn, {session.displayName}</strong>
                    <span>What do you do?</span>
                  </div>
                  <div className="suggestion-row">
                    {campaign.currentUi.suggestions.map((suggestion) => (
                      <button key={suggestion} onClick={() => setAction(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  {currentPlayer?.specialMoveAvailable && (
                    <button
                      type="button"
                      className={`special-action-button ${useSpecialMove ? 'selected' : ''}`}
                      onClick={() => setUseSpecialMove((selected) => !selected)}
                    >
                      <Star size={14} />
                      {useSpecialMove
                        ? 'Special move ready'
                        : `Use ${currentPlayer.specialMove.split('—')[0]?.trim()}`}
                    </button>
                  )}
                  <form onSubmit={(event) => void submitAction(event)}>
                    <textarea
                      value={action}
                      onChange={(event) => setAction(event.target.value)}
                      maxLength={600}
                      rows={2}
                      placeholder="Describe anything you want to try…"
                      disabled={busy}
                      aria-label="Your action"
                    />
                    <button
                      className="send-button"
                      disabled={!action.trim() || busy}
                      aria-label="Send action"
                    >
                      <Send size={19} />
                    </button>
                  </form>
                  <small className="action-hint">
                    <Dices size={14} /> If it is risky, the server rolls a visible d20. The story
                    always moves forward.
                  </small>
                </>
              )}
            </section>
          )}

          {campaign.status === 'chapter_complete' && (
            <section className="chapter-complete">
              <span>
                <Star />
              </span>
              <p className="eyebrow">Chapter {campaign.chapterNumber} complete</p>
              <h2>A good place to rest</h2>
              <p>{campaign.lastNarration}</p>
              <div className="feedback-row">
                <small>How did this chapter feel?</small>
                {(['loved_it', 'okay', 'not_for_us'] as const).map((rating) => (
                  <button
                    className={feedbackSent === rating ? 'selected' : ''}
                    key={rating}
                    disabled={Boolean(feedbackSent)}
                    onClick={() => void rateChapter(rating)}
                  >
                    {rating === 'loved_it'
                      ? '😍 Loved it'
                      : rating === 'okay'
                        ? '🙂 Okay'
                        : '😕 Not for us'}
                  </button>
                ))}
              </div>
              {session.role === 'parent' ? (
                <button
                  className="primary-button"
                  disabled={!playersOnline || busy}
                  onClick={() => void startChapter()}
                >
                  <Sparkles size={17} /> Begin next chapter
                </button>
              ) : (
                <div className="waiting-chip">
                  <Clock3 size={15} /> The parent opens the next chapter
                </div>
              )}
            </section>
          )}

          {session.role === 'parent' && (
            <div className="parent-tools">
              <ToneControls settings={campaign.contentSettings} onSave={saveContentSettings} />
              {campaign.recentTurns.length > 0 && (
                <button disabled={busy} onClick={() => void rewind()}>
                  <RotateCcw size={14} /> Rewind last turn
                </button>
              )}
              <button disabled={busy} onClick={() => void exportCampaign()}>
                <Download size={14} /> Export
              </button>
              <button className="danger-tool" disabled={busy} onClick={() => void deleteCampaign()}>
                <Trash2 size={14} /> Delete
              </button>
              <span>Parent control</span>
            </div>
          )}
        </section>

        <aside className="right-rail">
          <section className="npc-card">
            <h3>In this scene</h3>
            {campaign.world.characters.map((character) => (
              <div key={character.id}>
                {character.portraitUrl ? (
                  <img src={character.portraitUrl} alt="" />
                ) : (
                  <span>{character.avatar}</span>
                )}
                <p>
                  <strong>{character.name}</strong>
                  <small>{character.description}</small>
                  <em>{character.relationship}</em>
                </p>
              </div>
            ))}
          </section>
          {campaign.lastRolls.length > 0 && (
            <section className="last-roll-card">
              <h3>
                <Dices size={16} /> Last roll
              </h3>
              {campaign.lastRolls.map((roll) => (
                <DiceResult key={roll.id} roll={roll} />
              ))}
            </section>
          )}
          <section className="facts-card">
            <h3>
              <Sparkles size={16} /> What you know
            </h3>
            <ul>
              {campaign.world.discoveredFacts.slice(-5).map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
