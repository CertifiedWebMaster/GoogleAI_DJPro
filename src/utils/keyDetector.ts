/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Track } from "../types";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Schmuckler Key Profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Standardize profiles to have mean = 0 and sum of squares = 1 for proper correlation
 */
function normalizeProfile(profile: number[]): number[] {
  const mean = profile.reduce((a, b) => a + b, 0) / profile.length;
  const centered = profile.map(v => v - mean);
  const sumSq = centered.reduce((sum, v) => sum + v * v, 0);
  const stdDev = Math.sqrt(sumSq);
  return centered.map(v => v / (stdDev || 1));
}

const N_MAJOR_PROFILE = normalizeProfile(MAJOR_PROFILE);
const N_MINOR_PROFILE = normalizeProfile(MINOR_PROFILE);

/**
 * High-fidelity client-side Web Audio key detection. Evaluates tonal frequency distribution on sampled Mono channels.
 */
export function detectKeyFromAudioBuffer(audioBuffer: AudioBuffer): string {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0); // first channel
  const totalSamples = channelData.length;

  // We take 5 representative slices of the audio to sample the musical contents
  const windowSize = 4096;
  const numWindows = 5;
  const chromagram = new Float32Array(12);

  for (let w = 0; w < numWindows; w++) {
    const startIdx = Math.floor(totalSamples * (0.15 + w * 0.12));
    if (startIdx + windowSize > totalSamples) break;

    for (let note = 0; note < 12; note++) {
      let noteEnergy = 0;
      
      // Correlate octaves 3 to 6
      for (let octave = 3; octave <= 6; octave++) {
        const midiNote = 12 * (octave + 1) + note;
        const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
        
        let real = 0;
        let imag = 0;
        const omega = (2 * Math.PI * frequency) / sampleRate;

        // Skip every other sample to keep performance extremely high (zero UI stutter)
        const step = 2;
        for (let i = 0; i < windowSize; i += step) {
          const sample = channelData[startIdx + i];
          const angle = omega * i;
          real += sample * Math.cos(angle);
          imag += sample * Math.sin(angle);
        }
        noteEnergy += (real * real + imag * imag);
      }
      chromagram[note] += noteEnergy;
    }
  }

  // Find mean and standard deviation of total chromagram
  let chromaSum = 0;
  for (let i = 0; i < 12; i++) chromaSum += chromagram[i];
  const meanChroma = chromaSum / 12;
  const centeredChroma = Array.from(chromagram).map(v => v - meanChroma);
  const chromaSumSq = centeredChroma.reduce((sum, v) => sum + v * v, 0);
  const chromaStdDev = Math.sqrt(chromaSumSq) || 1;
  const normalizedChroma = centeredChroma.map(v => v / chromaStdDev);

  let bestKey = "C";
  let bestCorrelation = -Infinity;

  for (let shift = 0; shift < 12; shift++) {
    let majCorr = 0;
    let minCorr = 0;

    for (let i = 0; i < 12; i++) {
      const chromaIdx = (i + shift) % 12;
      majCorr += normalizedChroma[chromaIdx] * N_MAJOR_PROFILE[i];
      minCorr += normalizedChroma[chromaIdx] * N_MINOR_PROFILE[i];
    }

    if (majCorr > bestCorrelation) {
      bestCorrelation = majCorr;
      bestKey = NOTE_NAMES[shift];
    }
    if (minCorr > bestCorrelation) {
      bestCorrelation = minCorr;
      bestKey = NOTE_NAMES[shift] + "m";
    }
  }

  return bestKey;
}

export function getDeterministicFallbackKey(trackId: string, title: string): string {
  const combined = trackId + title;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  
  const keys = [
    "Am", "C", "Em", "G", "Dm", "F", "Bm", "D", 
    "F#m", "A", "C#m", "E", "G#m", "B", "D#m", "F#",
    "Fm", "Ab", "Cm", "Eb", "Bbm", "Db"
  ];
  return keys[hash % keys.length];
}
