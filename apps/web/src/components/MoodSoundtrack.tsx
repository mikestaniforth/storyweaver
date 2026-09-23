import type { MusicCue } from '@family-adventure/shared';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChiptuneEngine } from '../lib/chiptune';

interface MoodSoundtrackProps {
  cue: MusicCue;
  intensity: number;
  ducked: boolean;
}

const cueLabels: Record<MusicCue, string> = {
  silence: 'Quiet scene',
  exploration: 'Exploration',
  wonder: 'Wonder',
  mystery: 'Mystery',
  tension: 'Tension',
  chase: 'Chase',
  reveal: 'Revelation',
  rest: 'Rest',
  triumph: 'Triumph',
  sorrow: 'Reflection',
};

export function MoodSoundtrack({ cue, intensity, ducked }: MoodSoundtrackProps) {
  const engine = useRef<ChiptuneEngine | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const stored = window.localStorage.getItem('family-adventure-music-volume');
    return stored ? Number(stored) : 0.55;
  });

  useEffect(() => {
    engine.current?.setScene(cue, intensity);
  }, [cue, intensity]);

  useEffect(() => {
    engine.current?.setDucked(ducked);
  }, [ducked]);

  useEffect(() => {
    function visibilityChanged() {
      if (!engine.current || !enabled) return;
      if (document.hidden) void engine.current.suspend();
      else void engine.current.resume();
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, [enabled]);

  useEffect(
    () => () => {
      void engine.current?.stop();
      engine.current = null;
    },
    [],
  );

  async function toggle() {
    if (enabled) {
      await engine.current?.stop();
      engine.current = null;
      setEnabled(false);
      return;
    }
    try {
      const next = new ChiptuneEngine();
      await next.start(cue, intensity, volume);
      next.setDucked(ducked);
      engine.current = next;
      setEnabled(true);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      setEnabled(false);
    }
  }

  function setVolume(next: number) {
    setVolumeState(next);
    window.localStorage.setItem('family-adventure-music-volume', String(next));
    engine.current?.setVolume(next);
  }

  return (
    <div className={`soundtrack-control ${enabled ? 'is-playing' : ''}`}>
      <button
        type="button"
        className="soundtrack-toggle"
        onClick={() => void toggle()}
        aria-pressed={enabled}
        title={enabled ? 'Turn off the adaptive soundtrack' : 'Enable the adaptive soundtrack'}
      >
        {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        <span>{enabled ? cueLabels[cue] : unavailable ? 'Sound unavailable' : 'Enable music'}</span>
        {enabled && <i aria-hidden="true" />}
      </button>
      {enabled && (
        <label className="soundtrack-volume">
          <Music2 size={14} />
          <span className="sr-only">Music volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </label>
      )}
    </div>
  );
}
