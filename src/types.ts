/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string; // MM:SS formatted
  bpm: number;
  url: string; // direct audio url (will go through our proxy to bypass CORS)
  genre: string;
  coverUrl?: string; // Optional custom visual avatar
  isUserUploaded?: boolean;
}

export interface SampleSound {
  id: string;
  name: string;
  hotkey: string;
  color: string;
  type: "airhorn" | "siren" | "laser" | "cymbal" | "sub" | "kick" | "snare" | "scratch";
}

export interface DeckState {
  isPlaying: boolean;
  isCueing: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  pitch: number; // Playback rate modifier (0.9 to 1.1)
  volume: number; // Deck-specific channel input fader (0.0 to 1.0)
  loopLength: number | null; // 1, 2, 4, 8, 16 beats, or null
  isLooping: boolean;
  eqLow: number; // dB boost/cut (-12 to 12)
  eqMid: number; // dB boost/cut (-12 to 12)
  eqHigh: number; // dB boost/cut (-12 to 12)
  filterVal: number; // -100 to 100 (Negative = lowpass, Positive = highpass, 0 = neutral)
  loadedTrack: Track | null;
  detectedKey?: string;
  isKeyAnalyzing?: boolean;
}
