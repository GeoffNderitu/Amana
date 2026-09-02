/**
 * Tiny, dependency-free sound engine. Everything is synthesized with the Web Audio API
 * (a few short oscillator tones) rather than shipping audio files, so there's nothing to
 * download and no asset licensing to worry about. Sounds are opt-out: on by default,
 * toggle persisted locally per-browser since it's a device preference, not account data.
 */

const STORAGE_KEY = 'amana:sound-enabled';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // ignore — worst case the preference doesn't persist this session
  }
}

interface Tone {
  freq: number;
  start: number; // seconds from now
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: Tone[]) {
  if (!isSoundEnabled()) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  for (const t of tones) {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.value = t.freq;
    const peak = t.gain ?? 0.12;
    const startAt = now + t.start;
    const endAt = startAt + t.duration;
    gainNode.gain.setValueAtTime(0, startAt);
    gainNode.gain.linearRampToValueAtTime(peak, startAt + Math.min(0.02, t.duration / 3));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

/** A soft click for everyday confirmations — logging a transaction, saving a setting. */
export function playClick() {
  playTones([{ freq: 720, start: 0, duration: 0.06, type: 'sine', gain: 0.06 }]);
}

/** A short two-note "coin" chime for small wins — funds added, category updated. */
export function playCoin() {
  playTones([
    { freq: 880, start: 0, duration: 0.09, type: 'triangle', gain: 0.1 },
    { freq: 1320, start: 0.07, duration: 0.12, type: 'triangle', gain: 0.09 },
  ]);
}

/** A bright rising arpeggio for real milestones — a goal fully funded, an achievement unlocked. */
export function playSuccess() {
  playTones([
    { freq: 523.25, start: 0, duration: 0.12, type: 'triangle' },
    { freq: 659.25, start: 0.1, duration: 0.12, type: 'triangle' },
    { freq: 783.99, start: 0.2, duration: 0.16, type: 'triangle', gain: 0.14 },
  ]);
}

/** A fuller fanfare reserved for leveling up — the biggest celebratory beat in the app. */
export function playLevelUp() {
  playTones([
    { freq: 392.0, start: 0, duration: 0.1, type: 'square', gain: 0.08 },
    { freq: 523.25, start: 0.09, duration: 0.1, type: 'square', gain: 0.08 },
    { freq: 659.25, start: 0.18, duration: 0.1, type: 'square', gain: 0.08 },
    { freq: 987.77, start: 0.27, duration: 0.28, type: 'triangle', gain: 0.16 },
  ]);
}
