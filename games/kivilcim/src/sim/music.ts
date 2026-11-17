/**
 * The generated beat (pure data). Tempo is tied to scroll speed: one beat = BEAT_PX of climb, so
 * steps are positions in the shaft, and a gate on the beat grid lands on a kick at any speed.
 * 16 steps per bar; a 4-bar minor progression per theme; layers enter with intensity.
 */
import { BEAT_PX, STEP_PX } from './constants';

export type Instrument = 'kick' | 'hat' | 'clap' | 'bass' | 'arp';

export interface NoteEvent {
  inst: Instrument;
  /** MIDI note (ignored for drums). */
  midi: number;
  /** 0..1 */
  vel: number;
}

export function bpmFor(speed: number): number {
  return (speed * 60) / BEAT_PX;
}

/**
 * Calls fn(step, delaySeconds) for every 16th step whose height lies in (fromY, toY], at the
 * given speed. Consecutive windows never repeat a step.
 */
export function stepsBetween(fromY: number, toY: number, speed: number, fn: (step: number, delay: number) => void): void {
  let k = Math.floor(fromY / STEP_PX) + 1;
  while (k * STEP_PX <= toY) {
    fn(k, (k * STEP_PX - fromY) / speed);
    k++;
  }
}

/** Root notes per theme (minor keys spread around the circle). */
const ROOTS = [45, 47, 43, 50, 41, 46, 48, 44, 49, 42];
/** i - VI - III - VII in natural minor, as semitone offsets of the chord roots. */
const PROGRESSION = [0, 8, 3, 10];
/** Arp shape over the chord (minor triad + octave), one note per 16th. */
const ARP = [0, 7, 12, 15, 12, 7, 3, 7];

const ev: NoteEvent = { inst: 'kick', midi: 0, vel: 1 };

/** Notes at a 16th step (absolute step index) for a theme and intensity 0..3. */
export function notesAt(theme: number, step: number, intensity: number, fn: (e: NoteEvent) => void): void {
  const s = ((step % 16) + 16) % 16;
  const bar = Math.floor(step / 16);
  const root = (ROOTS[theme % ROOTS.length] ?? 45) + (PROGRESSION[((bar % 4) + 4) % 4] ?? 0);
  const emitNote = (inst: Instrument, midi: number, vel: number): void => {
    ev.inst = inst;
    ev.midi = midi;
    ev.vel = vel;
    fn(ev);
  };
  if (s % 4 === 0) emitNote('kick', 0, s === 0 ? 1 : 0.9);
  if (s % 4 === 2) emitNote('hat', 0, 0.55);
  else if (intensity >= 3 && s % 2 === 1) emitNote('hat', 0, 0.25);
  if (intensity >= 1) {
    // Offbeat pumping bass, an octave jump on the last 8th of the bar.
    if (s % 4 === 2) emitNote('bass', s === 14 ? root + 12 : root, 0.8);
    if (s === 0) emitNote('bass', root - 12, 0.6);
  }
  if (intensity >= 2) emitNote('arp', root + 24 + (ARP[s % ARP.length] ?? 0), s % 4 === 0 ? 0.6 : 0.4);
  if (intensity >= 3 && (s === 4 || s === 12)) emitNote('clap', 0, 0.8);
}
