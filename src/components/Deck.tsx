/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Track, DeckState } from "../types";
import { Play, Pause, Square, RefreshCw, Layers, Sparkles, Disc3 } from "lucide-react";

interface DeckProps {
  id: "A" | "B";
  loadedTrack: Track | null;
  deckState: DeckState;
  updateDeckState: (id: "A" | "B", updates: Partial<DeckState>) => void;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  otherDeckState: DeckState;
  onSync: () => void;
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>;
}

export default function Deck({
  id,
  loadedTrack,
  deckState,
  updateDeckState,
  audioRef,
  otherDeckState,
  onSync,
  analyserNodeRef,
}: DeckProps) {
  const [platterAngle, setPlatterAngle] = useState(0);
  const [cuePoint, setCuePoint] = useState<number>(0);
  const [customWaveformPeaks, setCustomWaveformPeaks] = useState<number[]>([]);
  
  const platterRef = useRef<HTMLDivElement>(null);
  const rAFRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Scratching mouse state dragging parameters
  const isScratching = useRef(false);
  const lastAngle = useRef(0);
  const isPlayingBeforeScratch = useRef(false);

  // Generate a distinct aesthetic waveform shape when a track is loaded
  useEffect(() => {
    if (!loadedTrack) {
      setCustomWaveformPeaks([]);
      return;
    }

    // Seed a deterministic waveform for each song to visually show breakdowns/drops
    const seed = loadedTrack.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const peaksCount = 120;
    const generatedPeaks: number[] = [];

    for (let i = 0; i < peaksCount; i++) {
      // Form structural intro beats, break in middle, drops at 1/3 and 2/3
      const progress = i / peaksCount;
      const baseWave = Math.sin(progress * Math.PI) * 0.4;
      const noise = Math.sin(progress * Math.PI * 18 + seed) * 0.25;
      
      let breakdownModifier = 1.0;
      if (progress > 0.4 && progress < 0.55) {
        breakdownModifier = 0.2; // Breakdown valley
      } else if (progress > 0.6 && progress < 0.7) {
        breakdownModifier = 1.3; // Heavy drops
      }

      const beatTicks = (i % 4 === 0) ? 0.2 : 0; // consistent visual transients
      
      const val = Math.max(0.05, (baseWave + noise + beatTicks) * breakdownModifier);
      generatedPeaks.push(Math.min(val, 0.95));
    }
    setCustomWaveformPeaks(generatedPeaks);
  }, [loadedTrack]);

  // Rotational Animation loop for Turntable platter
  useEffect(() => {
    let lastTime = performance.now();
    
    const animatePlatter = (nowTime: number) => {
      if (deckState.isPlaying && !isScratching.current) {
        const delta = nowTime - lastTime;
        // Adjust speed based on BPM modified by current Pitch slider (playback rate)
        const rotationSpeed = (0.05 * (deckState.bpm / 120)) * deckState.pitch;
        setPlatterAngle((prev) => (prev + rotationSpeed * delta) % 360);
      }
      lastTime = nowTime;
      rAFRef.current = requestAnimationFrame(animatePlatter);
    };

    rAFRef.current = requestAnimationFrame(animatePlatter);
    return () => {
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    };
  }, [deckState.isPlaying, deckState.bpm, deckState.pitch]);

  // Sync state loop with HTML5 audio properties
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isScratching.current) {
        updateDeckState(id, { currentTime: audio.currentTime });
      }

      // 1. Check & Enforce Beats Loop bounds
      if (deckState.isLooping && deckState.loopLength && deckState.isPlaying) {
        const beatDuration = 60 / deckState.bpm;
        const loopDurationSeconds = beatDuration * deckState.loopLength;
        const currentLoopStart = cuePoint; // loops start at the CUE point! Or start from loop activation
        const currentLoopEnd = currentLoopStart + loopDurationSeconds;

        if (audio.currentTime >= currentLoopEnd || audio.currentTime < currentLoopStart) {
          audio.currentTime = currentLoopStart;
        }
      }
    };

    const handleLoadedMetadata = () => {
      updateDeckState(id, { duration: audio.duration || 240 });
    };

    const handleTrackEnd = () => {
      updateDeckState(id, { isPlaying: false, currentTime: 0 });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleTrackEnd);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleTrackEnd);
    };
  }, [audioRef.current, deckState.isLooping, deckState.loopLength, deckState.isPlaying, deckState.bpm, cuePoint]);

  // Playback Pitch / Speed Modifier Controller
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      // Modulate both velocity & pitch just like classic vinyl
      audio.playbackRate = deckState.pitch;
    }
  }, [deckState.pitch, audioRef.current]);

  // Volume Engine connection
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = deckState.volume;
    }
  }, [deckState.volume, audioRef.current]);

  // Render Realtime Level Analysis inside the deck
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let levelAnimFrame: number;
    const analyser = analyserNodeRef.current;
    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    const drawLevel = () => {
      levelAnimFrame = requestAnimationFrame(drawLevel);
      
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Simple bar visualizer back lights
      if (analyser && deckState.isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const intensity = average / 140; // Normalize volume scaling

        // Drawing audio levels
        ctx.fillStyle = id === "A" ? "rgba(16, 185, 129, 0.15)" : "rgba(168, 85, 247, 0.15)";
        ctx.fillRect(0, 0, width, height);

        // Individual vertical equalizer indicators
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = id === "A" ? "#34d399" : "#c084fc";
        ctx.fillText(`LVL: ${(intensity * 100).toFixed(0)}%`, 5, 12);
        
        // Single green-to-red clip meter
        const barHeight = height * intensity;
        const grad = ctx.createLinearGradient(0, height, 0, 0);
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(0.7, "#eab308");
        grad.addColorStop(1.0, "#ef4444");

        ctx.fillStyle = grad;
        ctx.fillRect(2, height - barHeight, 6, barHeight);
      } else {
        ctx.fillStyle = "#334155";
        ctx.fillRect(2, height - 3, 6, 3);
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "#475569";
        ctx.fillText(`READY`, 5, 12);
      }
    };

    drawLevel();
    return () => {
      cancelAnimationFrame(levelAnimFrame);
    };
  }, [analyserNodeRef.current, deckState.isPlaying]);

  // Audio Playback / Pause triggering
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !loadedTrack) return;

    if (deckState.isPlaying) {
      audio.pause();
      updateDeckState(id, { isPlaying: false });
    } else {
      audio.play().catch(err => console.log("Init session sound blocked", err));
      updateDeckState(id, { isPlaying: true });
    }
  };

  // Vinyl Direct Scratch Handlers (Compute angular rotation change on drag)
  const getMouseAngle = (clientX: number, clientY: number): number => {
    if (!platterRef.current) return 0;
    const rect = platterRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.atan2(clientY - centerY, clientX - centerX);
  };

  const handleScratchStart = (e: React.MouseEvent) => {
    if (!loadedTrack || !audioRef.current) return;
    e.preventDefault();
    isScratching.current = true;
    isPlayingBeforeScratch.current = deckState.isPlaying;

    if (deckState.isPlaying) {
      audioRef.current.pause();
    }

    lastAngle.current = getMouseAngle(e.clientX, e.clientY);
    
    // Add global window mouse events during drag
    window.addEventListener("mousemove", handleScratchMove);
    window.addEventListener("mouseup", handleScratchEnd);
  };

  const handleScratchMove = (e: MouseEvent) => {
    if (!isScratching.current || !audioRef.current) return;

    const currentAngle = getMouseAngle(e.clientX, e.clientY);
    let angleDiff = currentAngle - lastAngle.current;

    // Handle sweep boundary crossing
    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const angleDeg = angleDiff * (180 / Math.PI);
    setPlatterAngle((prev) => (prev + angleDeg) % 360);

    // Scrub Audio Track currentTime proportional to movement!
    // Creates a genuine scratching scrub audio trick
    const scrubSensitivity = 0.08;
    const newTime = Math.max(0, Math.min(deckState.duration, audioRef.current.currentTime + angleDiff * scrubSensitivity));
    audioRef.current.currentTime = newTime;
    updateDeckState(id, { currentTime: newTime });

    lastAngle.current = currentAngle;
  };

  const handleScratchEnd = () => {
    isScratching.current = false;
    window.removeEventListener("mousemove", handleScratchMove);
    window.removeEventListener("mouseup", handleScratchEnd);

    // Resume playback if playing previously
    if (isPlayingBeforeScratch.current && audioRef.current) {
      audioRef.current.play().catch(() => {});
      updateDeckState(id, { isPlaying: true });
    }
  };

  // CUE Mechanics: Jump or record cue markers
  const triggerCue = () => {
    const audio = audioRef.current;
    if (!audio || !loadedTrack) return;

    if (!deckState.isPlaying) {
      // Paused: Click CUE to set a cue point at the current playback head
      setCuePoint(audio.currentTime);
    } else {
      // Playing: Click CUE to jump back to recorded cue and pause
      audio.pause();
      audio.currentTime = cuePoint;
      updateDeckState(id, { isPlaying: false, currentTime: cuePoint });
    }
  };

  // Beat Looping logic triggers
  const toggleLoop = (beats: number) => {
    if (!loadedTrack) return;

    if (deckState.isLooping && deckState.loopLength === beats) {
      // Disable loop
      updateDeckState(id, { isLooping: false, loopLength: null });
    } else {
      // Set or override loop beats
      setCuePoint(deckState.currentTime); // start loop here!
      updateDeckState(id, { isLooping: true, loopLength: beats });
    }
  };

  // Custom UI Track wave scrubbing
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !loadedTrack) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const seekTime = clickRatio * deckState.duration;

    audio.currentTime = seekTime;
    updateDeckState(id, { currentTime: seekTime });
  };

  // Seconds formatter helper (MM:SS)
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Calculate dynamic output BPM (affected by current pitch slider modifier)
  const dynamicBpm = (deckState.bpm * deckState.pitch).toFixed(1);

  return (
    <div id={`dj-deck-${id}`} className={`bg-[#111] border ${
      id === "A" ? "border-orange-500/10 focus-within:border-orange-500/30" : "border-blue-500/10 focus-within:border-blue-500/30"
    } p-6 rounded-2xl flex flex-col justify-between gap-6 relative shadow-2xl`}>
      
      {/* Decorative Deck Label Grid */}
      <div className="absolute top-3 left-4 flex items-center gap-1.5 select-none">
        <span className={`w-2.5 h-2.5 rounded-full ${id === "A" ? "bg-orange-500 shadow-orange-500/80 animate-pulse" : "bg-blue-500 shadow-blue-500/80 animate-pulse"}`} />
        <span className="text-[10px] font-black tracking-widest text-[#555] uppercase">DECK {id}</span>
      </div>

      <div className="absolute top-3 right-4">
        <canvas ref={canvasRef} width={64} height={18} className="bg-[#050505] border border-white/5 rounded opacity-80" />
      </div>

      {/* Top Section - Metadata & Track Visual Timeline */}
      <div className="mt-4 flex flex-col gap-2">
        {loadedTrack ? (
          <div>
            <h3 className="text-lg font-bold text-gray-200 line-clamp-1">{loadedTrack.title}</h3>
            <p className="text-xs text-gray-400 line-clamp-1">{loadedTrack.artist}</p>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-black text-zinc-700 uppercase italic">NO TRACK LOADED</h3>
            <p className="text-xs text-zinc-600">Select song from library below to start</p>
          </div>
        )}

        {/* Playback time counters */}
        <div className="flex justify-between items-center bg-[#050505] px-3 py-1.5 rounded-xl border border-white/5 font-mono text-sm font-bold text-gray-300">
          <span className={id === "A" ? "text-orange-500" : "text-blue-400"}>
            {formatTime(deckState.currentTime)}
          </span>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-500">
            {formatTime(deckState.duration)}
          </span>
        </div>
      </div>

      {/* Deck Layout Grid - Vinyl Platter left, Pitch Control right */}
      <div className="flex items-center justify-between gap-6 bg-[#050505]/40 p-4 rounded-xl border border-white/5">
        
        {/* Virtual vinyl platter */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div
            id={`platter-${id}`}
            ref={platterRef}
            onMouseDown={handleScratchStart}
            style={{ transform: `rotate(${platterAngle}deg)` }}
            className={`w-40 h-40 md:w-44 md:h-44 rounded-full bg-[#050505] border-[6px] border-zinc-900 shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none relative transition-shadow duration-300 ${
              deckState.isPlaying ? (id === "A" ? "shadow-orange-500/5" : "shadow-blue-500/5") : ""
            }`}
          >
            {/* Turntable concentric grooves */}
            <div className="absolute inset-2 rounded-full border border-black border-dashed opacity-50" />
            <div className="absolute inset-6 rounded-full border border-black opacity-60" />
            <div className="absolute inset-10 rounded-full border border-black border-dashed opacity-50" />
            <div className="absolute inset-14 rounded-full border border-black opacity-60" />

            {/* Neon Slipmat art depending on the Deck */}
            <div className={`absolute inset-4 rounded-full border-2 border-dashed ${
              id === "A" ? "border-orange-500/20" : "border-blue-500/20"
            } flex items-center justify-center`}>
              {/* Spinning Logo Disc item */}
              <div className="w-16 h-16 rounded-full bg-[#0a0a0a] border-2 border-zinc-900 flex items-center justify-center shadow-inner">
                {loadedTrack?.coverUrl ? (
                  <img
                    src={loadedTrack.coverUrl}
                    alt="cover"
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover opacity-70"
                  />
                ) : (
                  <Disc3 className={`h-8 w-8 ${id === "A" ? "text-orange-500/40" : "text-blue-500/40"}`} />
                )}
                {/* Center spindle */}
                <div className="absolute w-3.5 h-3.5 rounded-full bg-zinc-450 border-2 border-zinc-650 shadow" />
              </div>
            </div>

            {/* Position Marker - Visual Vinyl marker lines for scratching tracking */}
            <div
              className={`absolute top-0 bottom-1/2 w-1.5 origin-bottom rounded-full ${
                id === "A" ? "bg-orange-500 shadow-glow" : "bg-blue-400 shadow-glow"
              }`}
            />
          </div>
          
          <span className="text-[10px] text-zinc-500 font-mono mt-2 uppercase tracking-tight select-none">
            DRAG DISC TO SCRATCH
          </span>
        </div>

        {/* Pitch / BPM adjust section */}
        <div className="flex flex-col items-center justify-between h-44 bg-[#050505] p-3 rounded-xl border border-white/5 text-center w-20 relative select-none">
          {/* Output BPM */}
          <div className="mb-2">
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">BPM</p>
            <p className="text-sm font-black text-gray-200 font-mono mt-1">{dynamicBpm}</p>
          </div>

          {/* Vertical pitch slider */}
          <div className="relative flex-1 flex flex-col items-center justify-center w-full">
            <input
              id={`pitch-slider-${id}`}
              type="range"
              min="0.9"
              max="1.1"
              step="0.001"
              value={deckState.pitch}
              onChange={(e) => updateDeckState(id, { pitch: parseFloat(e.target.value) })}
              className="vertical-slider h-24 w-1 bg-zinc-850 rounded-full appearance-none outline-none cursor-ns-resize"
              style={{ WebkitAppearance: "none", writingMode: "bt-lr" } as any}
            />
            {/* Center zero detent mark */}
            <div className="absolute top-1/2 left-0 right-0 h-1 border-t border-zinc-800 pointer-events-none" />
          </div>

          {/* Reset Pitch */}
          <button
            id={`reset-pitch-${id}`}
            onClick={() => updateDeckState(id, { pitch: 1.0 })}
            className="text-[10px] font-bold text-gray-400 hover:text-white mt-2 flex items-center gap-0.5"
            title="Reset Pitch (0.0%)"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            {( (deckState.pitch - 1.0) * 100 ).toFixed(1)}%
          </button>
        </div>
      </div>

      {/* Interactive Waveform Display Row */}
      <div className="flex flex-col gap-1 select-none">
        <span className="text-[10px] text-zinc-550 font-black tracking-widest uppercase">Visual Beats Timeline / Waveform</span>
        <div
          id={`waveform-track-${id}`}
          onClick={handleWaveformClick}
          className="relative h-12 bg-[#050505] border border-white/5 rounded-xl overflow-hidden cursor-pointer flex items-center px-1"
        >
          {customWaveformPeaks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 font-semibold tracking-wider uppercase">
              Drag file or select track to reveal song wave
            </div>
          ) : (
            <div className="w-full h-full flex items-center gap-px">
              {customWaveformPeaks.map((peak, idx) => {
                const ratio = idx / customWaveformPeaks.length;
                const playRatio = deckState.currentTime / (deckState.duration || 1);
                const hasPassed = ratio < playRatio;
                
                return (
                  <div
                    key={idx}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${peak * 100}%`,
                      backgroundColor: hasPassed
                        ? id === "A"
                          ? "#f97316" // Active passed Orange
                          : "#3b82f6" // Active passed Blue
                        : "#222", // dark slate upcoming background
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Live cue position head bar indicator */}
          {loadedTrack && (
            <div
              className={`absolute top-0 bottom-0 w-0.5 ${
                id === "A" ? "bg-orange-500 shadow-glow" : "bg-blue-400 shadow-glow"
              }`}
              style={{ left: `${(deckState.currentTime / (deckState.duration || 1)) * 100}%` }}
            />
          )}

          {/* Cue Point overlay dot indicator */}
          {loadedTrack && cuePoint > 0 && (
            <div
              className="absolute top-0 bottom-0 w-1.5 bg-orange-500 rounded-full opacity-60 border border-black"
              style={{ left: `${(cuePoint / (deckState.duration || 1)) * 100}%` }}
              title="CUE Point"
            />
          )}
        </div>
      </div>

      {/* Beat Looping Block */}
      <div className="flex flex-col gap-1.5 select-none">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-zinc-500 font-black tracking-widest uppercase flex items-center gap-1">
            <Layers className="h-3 w-3" /> BEAT LOOP ENGINE
          </span>
          {deckState.isLooping && (
            <span className="text-[9px] text-orange-500 font-bold uppercase tracking-wider animate-pulse font-mono">
              LOOP ACTIVE ({deckState.loopLength} BEATS)
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 4, 8].map((beats) => {
            const isLoopActive = deckState.isLooping && deckState.loopLength === beats;
            return (
              <button
                id={`loop-btn-${id}-${beats}`}
                key={beats}
                onClick={() => toggleLoop(beats)}
                className={`py-1.5 text-xs font-bold font-mono rounded-lg transition-all border cursor-pointer ${
                  isLoopActive
                    ? "bg-orange-500 text-slate-950 border-orange-400 font-black scale-[0.98]"
                    : "bg-[#050505] hover:bg-zinc-900 text-gray-300 border-white/5"
                }`}
              >
                {beats}B
              </button>
            );
          })}
        </div>
      </div>

      {/* Play, Cue, Sync Control Button block */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 select-none">
        {/* Play/Pause Button */}
        <button
          id={`play-btn-${id}`}
          onClick={togglePlay}
          disabled={!loadedTrack}
          className={`h-11 rounded-xl flex items-center justify-center font-bold text-sm shadow transition-all cursor-pointer ${
            !loadedTrack
              ? "bg-[#050505] text-zinc-700 border border-white/5 cursor-not-allowed"
              : deckState.isPlaying
              ? "bg-rose-600 text-white hover:bg-rose-500 scale-[0.98]"
              : id === "A"
              ? "bg-orange-500 hover:bg-orange-600 text-slate-950"
              : "bg-blue-600 hover:bg-blue-500 text-white font-bold"
          }`}
        >
          {deckState.isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </button>

        {/* CDJ CUE Button - Sets checkpoint/jumps back on hold */}
        <button
          id={`cue-btn-${id}`}
          onClick={triggerCue}
          disabled={!loadedTrack}
          className={`h-11 rounded-xl flex items-center justify-center font-black text-xs font-mono tracking-widest border transition-all cursor-pointer ${
            !loadedTrack
              ? "bg-[#050505] text-zinc-700 border-white/5 cursor-not-allowed"
              : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/20 active:scale-95"
          }`}
          title="Set or play from cue point (HOLD to cue)"
        >
          CUE
        </button>

        {/* Sync Button */}
        <button
          id={`sync-btn-${id}`}
          onClick={onSync}
          disabled={!loadedTrack}
          className={`h-11 rounded-xl flex items-center justify-center text-xs font-black tracking-wider uppercase border gap-1 transition-all cursor-pointer ${
            !loadedTrack
              ? "bg-[#050505] text-zinc-700 border-white/5 cursor-not-allowed"
              : "bg-[#050505] hover:bg-[#1a1a1a] text-blue-400 border-blue-500/15"
          }`}
          title="Sync BPM with opposite deck"
        >
          <Sparkles className="h-3 w-3" />
          SYNC
        </button>
      </div>

    </div>
  );
}
