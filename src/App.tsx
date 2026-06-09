/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Track, DeckState } from "./types";
import Deck from "./components/Deck";
import Mixer from "./components/Mixer";
import SongLibrary from "./components/SongLibrary";
import SampleGrid from "./components/SampleGrid";
import { PRELOADED_TRACKS } from "./data";
import { PlayCircle, Award, VolumeX, ShieldAlert, Cloud, HelpCircle, Activity, Disc, Sparkles } from "lucide-react";

export default function App() {
  const [sessionActive, setSessionActive] = useState(false);
  const [crossfader, setCrossfader] = useState(0); // -1 (left A) to +1 (right B)
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [fxDelay, setFxDelay] = useState(0.0); // Wet delay fader
  const [fxDelayTime, setFxDelayTime] = useState(0.5); // Second intervals (1/4 loop)
  const [fxReverb, setFxReverb] = useState(0.05); // Wet reverb fader

  // SoundCloud active embedded widget stream
  const [activeScUrl, setActiveScUrl] = useState<string | null>(null);

  // Deck states
  const [deckA, setDeckA] = useState<DeckState>({
    isPlaying: false,
    isCueing: false,
    currentTime: 0,
    duration: 0,
    bpm: PRELOADED_TRACKS[0].bpm,
    pitch: 1.0,
    volume: 0.8,
    loopLength: null,
    isLooping: false,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filterVal: 0,
    loadedTrack: null,
  });

  const [deckB, setDeckB] = useState<DeckState>({
    isPlaying: false,
    isCueing: false,
    currentTime: 0,
    duration: 0,
    bpm: PRELOADED_TRACKS[1].bpm,
    pitch: 1.0,
    volume: 0.8,
    loopLength: null,
    isLooping: false,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filterVal: 0,
    loadedTrack: null,
  });

  // Web Audio Context & Node persistence
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Hidden physical audio element tags
  const audioRefA = useRef<HTMLAudioElement | null>(null);
  const audioRefB = useRef<HTMLAudioElement | null>(null);

  // Sound Engine Node connections
  const sourceNodeRefA = useRef<MediaElementAudioSourceNode | null>(null);
  const sourceNodeRefB = useRef<MediaElementAudioSourceNode | null>(null);

  const eqLowNodeRefA = useRef<BiquadFilterNode | null>(null);
  const eqMidNodeRefA = useRef<BiquadFilterNode | null>(null);
  const eqHighNodeRefA = useRef<BiquadFilterNode | null>(null);
  const filterNodeRefA = useRef<BiquadFilterNode | null>(null);
  const gainNodeRefA = useRef<GainNode | null>(null);
  const crossfaderNodeRefA = useRef<GainNode | null>(null);
  const analyserRefA = useRef<AnalyserNode | null>(null);

  const eqLowNodeRefB = useRef<BiquadFilterNode | null>(null);
  const eqMidNodeRefB = useRef<BiquadFilterNode | null>(null);
  const eqHighNodeRefB = useRef<BiquadFilterNode | null>(null);
  const filterNodeRefB = useRef<BiquadFilterNode | null>(null);
  const gainNodeRefB = useRef<GainNode | null>(null);
  const crossfaderNodeRefB = useRef<GainNode | null>(null);
  const analyserRefB = useRef<AnalyserNode | null>(null);

  // FX Nodes
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackNodeRef = useRef<GainNode | null>(null);
  const delayWetNodeRef = useRef<GainNode | null>(null);
  const reverbWetNodeRef = useRef<GainNode | null>(null);
  
  const masterVolumeNodeRef = useRef<GainNode | null>(null);
  const samplerVolumeNodeRef = useRef<GainNode | null>(null); // Dedicated node for sample pads

  // Sync session clock tracking
  const [sessionTimer, setSessionTimer] = useState("00:00");
  useEffect(() => {
    if (!sessionActive) return;
    let sec = 0;
    const interval = setInterval(() => {
      sec++;
      const m = Math.floor(sec / 60).toString().padStart(2, "0");
      const s = (sec % 60).toString().padStart(2, "0");
      setSessionTimer(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionActive]);

  // Launch web audio platform
  const handleStartSession = async () => {
    // 1. Instantiate browser context AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      alert("Web Audio API is not supported in this browser. Please open in Chrome or Safari!");
      return;
    }

    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    // 2. Load and build Hidden Audio Elements
    const audioA = audioRefA.current;
    const audioB = audioRefB.current;
    if (!audioA || !audioB) return;

    // Enable CORS tags
    audioA.crossOrigin = "anonymous";
    audioB.crossOrigin = "anonymous";

    // 3. Setup and Route Deck A Nodes
    const srcA = ctx.createMediaElementSource(audioA);
    sourceNodeRefA.current = srcA;

    const eqLowA = ctx.createBiquadFilter();
    eqLowA.type = "lowshelf";
    eqLowA.frequency.value = 240; // Bass
    eqLowNodeRefA.current = eqLowA;

    const eqMidA = ctx.createBiquadFilter();
    eqMidA.type = "peaking";
    eqMidA.frequency.value = 1600; // Mids
    eqMidA.Q.value = 1.0;
    eqMidNodeRefA.current = eqMidA;

    const eqHighA = ctx.createBiquadFilter();
    eqHighA.type = "highshelf";
    eqHighA.frequency.value = 6000; // Trebles
    eqHighNodeRefA.current = eqHighA;

    const filterValA = ctx.createBiquadFilter();
    filterValA.type = "lowpass";
    filterValA.frequency.value = 22000; // Initial flat pass
    filterNodeRefA.current = filterValA;

    const gainA = ctx.createGain();
    gainNodeRefA.current = gainA;

    const crossA = ctx.createGain();
    crossfaderNodeRefA.current = crossA;

    const anaA = ctx.createAnalyser();
    anaA.fftSize = 64;
    analyserRefA.current = anaA;

    // Routing Deck A: Source -> Low -> Mid -> High -> Sweep Filter -> Gain -> Crossfader -> Analyser
    srcA.connect(eqLowA);
    eqLowA.connect(eqMidA);
    eqMidA.connect(eqHighA);
    eqHighA.connect(filterValA);
    filterValA.connect(gainA);
    gainA.connect(crossA);
    crossA.connect(anaA);

    // 4. Setup and Route Deck B Nodes
    const srcB = ctx.createMediaElementSource(audioB);
    sourceNodeRefB.current = srcB;

    const eqLowB = ctx.createBiquadFilter();
    eqLowB.type = "lowshelf";
    eqLowB.frequency.value = 240;
    eqLowNodeRefB.current = eqLowB;

    const eqMidB = ctx.createBiquadFilter();
    eqMidB.type = "peaking";
    eqMidB.frequency.value = 1600;
    eqMidB.Q.value = 1.0;
    eqMidNodeRefB.current = eqMidB;

    const eqHighB = ctx.createBiquadFilter();
    eqHighB.type = "highshelf";
    eqHighB.frequency.value = 6000;
    eqHighNodeRefB.current = eqHighB;

    const filterValB = ctx.createBiquadFilter();
    filterValB.type = "lowpass";
    filterValB.frequency.value = 22000;
    filterNodeRefB.current = filterValB;

    const gainB = ctx.createGain();
    gainNodeRefB.current = gainB;

    const crossB = ctx.createGain();
    crossfaderNodeRefB.current = crossB;

    const anaB = ctx.createAnalyser();
    anaB.fftSize = 64;
    analyserRefB.current = anaB;

    // Routing Deck B
    srcB.connect(eqLowB);
    eqLowB.connect(eqMidB);
    eqMidB.connect(eqHighB);
    eqHighB.connect(filterValB);
    filterValB.connect(gainB);
    gainB.connect(crossB);
    crossB.connect(anaB);

    // 5. Master Output and Global FX Loop Section
    const masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    masterVolumeNodeRef.current = masterGain;

    // Connect Sampler channels
    const samplerGain = ctx.createGain();
    samplerGain.gain.value = 0.85; // safe default pad volume
    samplerVolumeNodeRef.current = samplerGain;
    samplerGain.connect(masterGain);

    // Route Decks to Master
    anaA.connect(masterGain);
    anaB.connect(masterGain);

    // Create Echo/Delay routing node loop
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = fxDelayTime;
    delayNodeRef.current = delay;

    const delayFB = ctx.createGain();
    delayFB.gain.value = 0.4; // 40% feedback trail
    delayFeedbackNodeRef.current = delayFB;

    const delayWet = ctx.createGain();
    delayWet.gain.value = fxDelay; // controlled by slider
    delayWetNodeRef.current = delayWet;

    // Connect Echo feedback loop
    masterGain.connect(delay);
    delay.connect(delayFB);
    delayFB.connect(delay); // Loop back
    delay.connect(delayWet);
    delayWet.connect(ctx.destination); // Send parallel echo to standard output

    // Create a physical Synthesizable Multi-Tap Reverb block
    const revWet = ctx.createGain();
    revWet.gain.value = fxReverb;
    reverbWetNodeRef.current = revWet;

    // We can synthesize simple lush reverb using a series of nested delay nodes
    const verbDelay1 = ctx.createDelay(0.1);
    verbDelay1.delayTime.value = 0.015;
    const verbDelay2 = ctx.createDelay(0.1);
    verbDelay2.delayTime.value = 0.025;
    const verbDelay3 = ctx.createDelay(0.1);
    verbDelay3.delayTime.value = 0.040;

    const verbFB = ctx.createGain();
    verbFB.gain.value = 0.55;

    masterGain.connect(verbDelay1);
    verbDelay1.connect(verbDelay2);
    verbDelay2.connect(verbDelay3);
    verbDelay3.connect(verbFB);
    verbFB.connect(verbDelay1); // simple comb loop
    
    verbDelay3.connect(revWet);
    revWet.connect(ctx.destination);

    // Connect direct master sum to speakers
    masterGain.connect(ctx.destination);

    // Update crossfading parameters
    updateCrossfading(0, crossA, crossB);

    // Finish launch
    setSessionActive(true);
    await ctx.resume();
  };

  // Safe Dynamic Crossfading using Constant-Power cosine formula to balance volumes
  const updateCrossfading = (val: number, nodeA: GainNode | null, nodeB: GainNode | null) => {
    const actNodeA = nodeA || crossfaderNodeRefA.current;
    const actNodeB = nodeB || crossfaderNodeRefB.current;
    if (!actNodeA || !actNodeB) return;

    // val ranges from -1.0 (Left Deck A only) to +1.0 (Right Deck B only)
    if (val <= 0) {
      actNodeA.gain.value = 1.0;
      // Fade down B as we slide left
      // Normalize fader position from 0 to 1
      const normalized = Math.abs(val); // 0 to 1
      actNodeB.gain.value = Math.cos(normalized * Math.PI / 2);
    } else {
      actNodeB.gain.value = 1.0;
      // Fade down A as we slide right
      actNodeA.gain.value = Math.cos(val * Math.PI / 2);
    }
  };

  // Handle Mixer slider/rotary change actions
  const handleKnobChange = (deckId: "A" | "B" | "Master", param: string, value: number) => {
    if (deckId === "A") {
      setDeckA((prev) => ({ ...prev, [param]: value }));

      const audio = audioRefA.current;
      // Low EQ
      if (param === "eqLow" && eqLowNodeRefA.current) {
        eqLowNodeRefA.current.gain.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
      }
      // Mid EQ
      if (param === "eqMid" && eqMidNodeRefA.current) {
        eqMidNodeRefA.current.gain.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
      }
      // High EQ
      if (param === "eqHigh" && eqHighNodeRefA.current) {
        eqHighNodeRefA.current.gain.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
      }
      // Sweep low/high filter
      if (param === "filterVal" && filterNodeRefA.current) {
        const node = filterNodeRefA.current;
        const now = audioContextRef.current?.currentTime || 0;
        if (value === 0) {
          node.type = "lowpass";
          node.frequency.setValueAtTime(22000, now); // Flat pass
        } else if (value < 0) {
          node.type = "lowpass";
          // MAP -100 to 100 to 200Hz to 20000Hz exponentially
          const freq = 20000 * Math.pow(10, (value / 50));
          node.frequency.setValueAtTime(Math.max(120, freq), now);
        } else {
          node.type = "highpass";
          // MAP 0 to 100 to 10Hz to 8000Hz
          const freq = (value / 100) * 6000;
          node.frequency.setValueAtTime(Math.max(20, freq), now);
        }
      }
      // Deck specific volume fader
      if (param === "volume" && gainNodeRefA.current) {
        gainNodeRefA.current.gain.value = value;
      }
    } else if (deckId === "B") {
      setDeckB((prev) => ({ ...prev, [param]: value }));

      const audio = audioRefB.current;
      if (param === "eqLow" && eqLowNodeRefB.current) {
        eqLowNodeRefB.current.gain.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
      }
      if (param === "eqMid" && eqMidNodeRefB.current) {
        eqMidNodeRefB.current.gain.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
      }
      if (param === "eqHigh" && eqHighNodeRefB.current) {
        eqHighNodeRefB.current.gain.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
      }
      if (param === "filterVal" && filterNodeRefB.current) {
        const node = filterNodeRefB.current;
        const now = audioContextRef.current?.currentTime || 0;
        if (value === 0) {
          node.type = "lowpass";
          node.frequency.setValueAtTime(22000, now);
        } else if (value < 0) {
          node.type = "lowpass";
          const freq = 20000 * Math.pow(10, (value / 50));
          node.frequency.setValueAtTime(Math.max(120, freq), now);
        } else {
          node.type = "highpass";
          const freq = (value / 100) * 6000;
          node.frequency.setValueAtTime(Math.max(20, freq), now);
        }
      }
      if (param === "volume" && gainNodeRefB.current) {
        gainNodeRefB.current.gain.value = value;
      }
    } else if (deckId === "Master") {
      // MASTER CONTROLS
      if (param === "crossfader") {
        setCrossfader(value);
        updateCrossfading(value, null, null);
      }
      if (param === "masterVolume") {
        setMasterVolume(value);
        if (masterVolumeNodeRef.current) {
          masterVolumeNodeRef.current.gain.value = value;
        }
      }
      // Reverb controls
      if (param === "fxReverb") {
        setFxReverb(value);
        if (reverbWetNodeRef.current) {
          reverbWetNodeRef.current.gain.value = value;
        }
      }
      // Delay depth controls
      if (param === "fxDelay") {
        setFxDelay(value);
        if (delayWetNodeRef.current) {
          delayWetNodeRef.current.gain.value = value;
        }
      }
      // Delay timing intervals
      if (param === "fxDelayTime") {
        setFxDelayTime(value);
        if (delayNodeRef.current) {
          delayNodeRef.current.delayTime.setValueAtTime(value, audioContextRef.current?.currentTime || 0);
        }
      }
    }
  };

  // Load selected track into corresponding Deck slot (Using proxy to bypass CORS audio blocking)
  const handleLoadTrack = (track: Track, deckId: "A" | "B") => {
    const audio = deckId === "A" ? audioRefA.current : audioRefB.current;
    if (!audio) return;

    // Check if SoundCloud track. If so, set the auxiliary widget stream container URL!
    if (track.genre === "SoundCloud Integration") {
      setActiveScUrl(track.url);
      return; // SoundCloud runs as aux overlay in the interface
    }

    // Determine final streaming target URL (Bypass CORS via our Express proxy if it's external, or load direct URL)
    const finalUrl = track.isUserUploaded 
      ? track.url // local object urls can be loaded natively with no CORS constraints!
      : `/api/proxy?url=${encodeURIComponent(track.url)}`;

    audio.src = finalUrl;
    audio.load();

    const updateState = {
      loadedTrack: track,
      bpm: track.bpm,
      pitch: 1.0,
      isPlaying: false,
      currentTime: 0,
      loopLength: null,
      isLooping: false,
    };

    if (deckId === "A") {
      setDeckA((prev) => ({ ...prev, ...updateState }));
    } else {
      setDeckB((prev) => ({ ...prev, ...updateState }));
    }
  };

  // Dynamic automatic synchronization of BPM (Sync button)
  const handleSyncDecks = (targetDeck: "A" | "B") => {
    if (targetDeck === "A") {
      if (!deckB.loadedTrack) return;
      // Match Deck A's BPM to Deck B's active BPM output
      const targetBPM = deckB.bpm * deckB.pitch;
      const calculatedPitch = targetBPM / deckA.bpm;
      setDeckA((prev) => ({ ...prev, pitch: calculatedPitch }));
    } else {
      if (!deckA.loadedTrack) return;
      const targetBPM = deckA.bpm * deckA.pitch;
      const calculatedPitch = targetBPM / deckB.bpm;
      setDeckB((prev) => ({ ...prev, pitch: calculatedPitch }));
    }
  };

  // Master Deck A/B state modifying callback
  const handleUpdateDeckState = (deckId: "A" | "B", updates: Partial<DeckState>) => {
    if (deckId === "A") {
      setDeckA((prev) => ({ ...prev, ...updates }));
    } else {
      setDeckB((prev) => ({ ...prev, ...updates }));
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-300 font-sans p-4 md:p-8 selection:bg-orange-500/30 selection:text-orange-400">
      
      {/* Hidden Audio element blocks, capturing raw streams */}
      <audio ref={audioRefA} className="hidden" />
      <audio ref={audioRefB} className="hidden" />

      {/* Launcher Intro Panel Backdrop */}
      {!sessionActive ? (
        <div className="max-w-xl mx-auto mt-16 md:mt-24 text-center bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden group">
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-blue-500 shrink-0" />
          
          {/* Centered blinking vinyl icon */}
          <div className="mx-auto w-32 h-32 md:w-36 md:h-36 rounded-full bg-[#050505] border-4 border-white/5 flex items-center justify-center relative mb-8 shadow-inner animate-pulse">
            <Disc className="h-16 w-16 md:h-20 md:w-20 text-orange-500 animate-[spin_5s_linear_infinite]" />
            <div className="absolute w-5 h-5 rounded-full bg-zinc-900 border-2 border-[#050505]" />
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-3">
            ONYX<span className="text-orange-500">MIX</span> DJ CONSOLE
          </h1>
          <p className="text-sm text-zinc-400 mb-8 max-w-sm mx-auto leading-relaxed">
            Professional multi-deck DJ mixing console with raw high-fidelity visual turntable platters, 3-band parametric hardware EQ knobs, synthesizer sample pads, and SoundCloud linkage.
          </p>

          <button
            id="launch-deck-btn"
            onClick={handleStartSession}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold py-4 rounded-2xl shadow-xl transition-all hover:scale-[1.01] flex items-center justify-center gap-2 text-base cursor-pointer"
          >
            <PlayCircle className="h-5 w-5" />
            INITIALIZE HARDWARE DECK
          </button>

          {/* Feature details line */}
          <div className="mt-8 grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-500 font-bold uppercase tracking-wider select-none">
            <span className="border-r border-white/5 pr-2">🎚️ 3-Band Param EQ</span>
            <span className="border-r border-white/5 pr-2">📀 Live Vinyl Scrub</span>
            <span>🎹 Synth Sampler</span>
          </div>
        </div>
      ) : (
        /* Real Virtual DJ Station Deck Layout */
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* SYSTEM HEADER BAR */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a0a0a] border border-white/10 rounded-2xl px-6 py-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#050505] border border-orange-500/25 flex items-center justify-center">
                <Disc className="h-5 w-5 text-orange-500 animate-spin" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-widest text-white uppercase flex items-center gap-1.5">
                  ONYX<span className="text-orange-500">MIX</span>
                  <span className="px-1.5 py-0.5 text-[8px] bg-orange-500/10 text-orange-500 font-bold tracking-widest rounded border border-orange-500/20 uppercase">
                    LIVE CONNECTION
                  </span>
                </h1>
                <span className="text-xs text-zinc-400">High-Fidelity Studio Mixer System & Sound Station</span>
              </div>
            </div>

            {/* Hardware VU Level Meters & Timer */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 bg-[#050505] px-4 py-2 border border-white/5 rounded-xl">
                <Activity className="h-4 w-4 text-orange-500 animate-pulse" />
                <div className="text-left font-mono">
                  <p className="text-[9px] text-zinc-500 leading-none">ELAPSED TIME</p>
                  <p className="text-sm font-black text-zinc-200 mt-0.5">{sessionTimer}</p>
                </div>
              </div>

              {/* Master Output Status Indicator */}
              <div className="flex items-center gap-2 bg-[#050505] px-4 py-2 border border-white/5 rounded-xl">
                <Sparkles className="h-4 w-4 text-blue-400" />
                <div className="text-left font-mono">
                  <p className="text-[9px] text-zinc-500 leading-none">SYS LEVEL</p>
                  <p className="text-sm font-black text-zinc-200 mt-0.5">{(masterVolume * 100).toFixed(0)}%</p>
                </div>
              </div>
            </div>
          </header>

          {/* ACTIVE SOUNDCLOUD FLOATING AUXILIARY PLAYLIST PLAYER */}
          {activeScUrl && (
            <div id="soundcloud-aux-deck" className="bg-gradient-to-r from-orange-600/10 via-[#0a0a0a] to-[#0a0a0a] border border-orange-500/20 p-5 rounded-2xl relative shadow-xl focus-within:border-orange-500/40 animate-fade-in">
              <div className="flex items-center justify-between mb-3 select-none">
                <div className="flex items-center gap-2 text-sm font-bold text-orange-500 uppercase tracking-widest">
                  <Cloud className="h-4 w-4 text-orange-500 animate-bounce" />
                  SoundCloud Connected Stream Active
                </div>
                <button
                  id="close-sc-deck"
                  onClick={() => setActiveScUrl(null)}
                  className="text-xs font-black text-zinc-400 hover:text-white cursor-pointer"
                  title="Remove auxiliary deck"
                >
                  DISCONNECT WIDGET
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/5 bg-[#050505]">
                {/* Official reliable SoundCloud player API Iframe */}
                <iframe
                  id="soundcloud-iframe-widget"
                  width="100%"
                  height="120"
                  scrolling="no"
                  frameBorder="no"
                  allow="autoplay"
                  src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(activeScUrl)}&color=%23f97316&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-2 italic flex items-center gap-1">
                <HelpCircle className="h-3 w-3 text-zinc-500" />
                Note: Standard web browsers run SoundCloud widgets in a sandboxed iframe. Use faders on your physical speakers to control the master volume stream!
              </p>
            </div>
          )}

          {/* ACTIVE DJ DECKS ROW & HARDWARE MIXER PORT GRID */}
          <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* DECK A TURNTABLE - Column span 4 */}
            <div className="lg:col-span-4 h-full">
              <Deck
                id="A"
                loadedTrack={deckA.loadedTrack}
                deckState={deckA}
                updateDeckState={handleUpdateDeckState}
                audioRef={audioRefA}
                otherDeckState={deckB}
                onSync={() => handleSyncDecks("A")}
                analyserNodeRef={analyserRefA}
              />
            </div>

            {/* HARDWARE MIXER - Column span 4 */}
            <div className="lg:col-span-4 h-full">
              <Mixer
                deckA={deckA}
                deckB={deckB}
                crossfader={crossfader}
                masterVolume={masterVolume}
                fxDelay={fxDelay}
                fxDelayTime={fxDelayTime}
                fxReverb={fxReverb}
                onChangeKnob={handleKnobChange}
              />
            </div>

            {/* DECK B TURNTABLE - Column span 4 */}
            <div className="lg:col-span-4 h-full">
              <Deck
                id="B"
                loadedTrack={deckB.loadedTrack}
                deckState={deckB}
                updateDeckState={handleUpdateDeckState}
                audioRef={audioRefB}
                otherDeckState={deckA}
                onSync={() => handleSyncDecks("B")}
                analyserNodeRef={analyserRefB}
              />
            </div>

          </main>

          {/* BOTTOM MUSIC SELECTION LIBRARY & SEQUENCER SAMPLE PADS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Library list loader - Column span 7 */}
            <div className="lg:col-span-7 h-full">
              <SongLibrary
                onLoadTrack={handleLoadTrack}
                deckTrackA={deckA.loadedTrack}
                deckTrackB={deckB.loadedTrack}
              />
            </div>

            {/* Tap Sample Synthesizers - Column span 5 */}
            <div className="lg:col-span-5 h-full">
              <SampleGrid
                audioContextRef={audioContextRef}
                samplerNodeRef={samplerVolumeNodeRef}
              />

              {/* Offline Safe Alert and User Instructions */}
              <div className="mt-4 bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 flex gap-3 text-xs text-zinc-450 shadow-md">
                <Award className="h-5 w-5 text-orange-500 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold text-zinc-200">Pro-DJ Mixing Controls Tip:</p>
                  <p>
                    Dragging the turntable platters on Deck A & B lets you scratch the track in real time. Hover and drag sliders on the Mixer console to sweep lowpass/highpass filters and sculpt your transition.
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}
      
    </div>
  );
}
