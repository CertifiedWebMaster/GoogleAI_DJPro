/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Track, SampleSound } from "./types";

export const PRELOADED_TRACKS: Track[] = [
  {
    id: "helix-1",
    title: "Trance Progression Alpha",
    artist: "SoundHelix Symphony",
    duration: "06:12",
    bpm: 120,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    genre: "Trance / Progressive",
    coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80&fit=crop"
  },
  {
    id: "helix-2",
    title: "Electro Synth Drive",
    artist: "SoundHelix Symphony",
    duration: "07:05",
    bpm: 128,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    genre: "Electro House",
    coverUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&q=80&fit=crop"
  },
  {
    id: "helix-3",
    title: "Sunset Lo-Fi Chill",
    artist: "SoundHelix Symphony",
    duration: "05:02",
    bpm: 96,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    genre: "Chill Wave / Lo-Fi",
    coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80&fit=crop"
  },
  {
    id: "helix-4",
    title: "Tech House Groove",
    artist: "SoundHelix Symphony",
    duration: "05:38",
    bpm: 124,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    genre: "Tech House",
    coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80&fit=crop"
  },
  {
    id: "helix-5",
    title: "Deep Liquid Drum & Bass",
    artist: "SoundHelix Symphony",
    duration: "08:14",
    bpm: 140,
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3",
    genre: "Liquid DnB",
    coverUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&q=80&fit=crop"
  }
];

export const SAMPLE_SOUNDS: SampleSound[] = [
  { id: "sample-1", name: "🚨 REGGAE HORN", hotkey: "1", color: "from-amber-500 to-red-600", type: "airhorn" },
  { id: "sample-2", name: "🔊 ECHO SIREN", hotkey: "2", color: "from-blue-500 to-indigo-700", type: "siren" },
  { id: "sample-3", name: "⚡ SCI-FI LASER", hotkey: "3", color: "from-emerald-400 to-teal-600", type: "laser" },
  { id: "sample-4", name: "💥 DEEP SUB BOOM", hotkey: "4", color: "from-purple-500 to-pink-600", type: "sub" },
  { id: "sample-5", name: "🥁 HOUSE KICK", hotkey: "Q", color: "from-sky-500 to-indigo-500", type: "kick" },
  { id: "sample-6", name: "👏 CRACK SNARE", hotkey: "W", color: "from-rose-500 to-orange-500", type: "snare" },
  { id: "sample-7", name: "✨ CYMBAL CRASH", hotkey: "E", color: "from-yellow-400 to-amber-500", type: "cymbal" },
  { id: "sample-8", name: "💿 VINYL SCRATCH", hotkey: "R", color: "from-gray-600 to-slate-800", type: "scratch" }
];
