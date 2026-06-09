/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Track, DeckState } from "../types";
import { Play, Pause, Square, RefreshCw, Layers, Sparkles, Disc3, Activity } from "lucide-react";

interface DeckProps {
  id: "A" | "B";
  loadedTrack: Track | null;
  deckState: DeckState;
  updateDeckState: (id: "A" | "B", updates: Partial<DeckState>) => void;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  otherDeckState: DeckState;
  onSync: () => void;
  analyserNodeRef: React.MutableRefObject<AnalyserNode | null>;
  compact?: boolean;
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
  compact = false,
}: DeckProps) {
  const [platterAngle, setPlatterAngle] = useState(0);
  const [cuePoint, setCuePoint] = useState<number>(0);
  const [customWaveformPeaks, setCustomWaveformPeaks] = useState<number[]>([]);
  
  const platterRef = useRef<HTMLDivElement>(null);
  const rAFRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Custom temporary pitch bend state
  const [nudge, setNudge] = useState<number>(0);

  // Custom Beat Repeat/Stutter Roll states and references
  const [isBeatRepeat, setIsBeatRepeat] = useState<boolean>(false);
  const isBeatRepeatActiveRef = useRef<boolean>(false);
  const beatRepeatStartRef = useRef<number>(0);

  // Real-time Db VU meter element references
  const vuMeterColorRef = useRef<HTMLDivElement>(null);
  const vuLevelTextRef = useRef<HTMLSpanElement>(null);

  // Dynamic scrolling waveform references
  const scrollWaveCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollWaveHistoryRef = useRef<{ amplitude: number; low: number; mid: number; high: number }[]>([]);

  const handleBeatRepeatToggle = () => {
    const audio = audioRef.current;
    if (!audio || !loadedTrack) return;

    if (isBeatRepeatActiveRef.current) {
      isBeatRepeatActiveRef.current = false;
      setIsBeatRepeat(false);
    } else {
      beatRepeatStartRef.current = audio.currentTime;
      isBeatRepeatActiveRef.current = true;
      setIsBeatRepeat(true);
    }
  };

  // Scratching mouse state dragging parameters
  const isScratching = useRef(false);
  const lastAngle = useRef(0);
  const isPlayingBeforeScratch = useRef(false);

  // Realtime BPM detection and beat density refs
  const liveBpmTextRef = useRef<HTMLSpanElement>(null);
  const confidenceRef = useRef<HTMLSpanElement>(null);
  const beatPulseDotRef = useRef<HTMLDivElement>(null);
  const densityValueTextRef = useRef<HTMLSpanElement>(null);
  const densityBarRefs = useRef<(HTMLDivElement | null)[]>([]);

  const lastBeatTimeRef = useRef<number>(0);
  const beatIntervalsRef = useRef<number[]>([]);
  const rollingEnergyRef = useRef<number>(60);
  const calculatedBpmRef = useRef<number>(deckState.bpm);
  const beatConfidenceRef = useRef<number>(0);
  const beatsTimestampsRef = useRef<number[]>([]);

  const bpmRef = useRef(deckState.bpm);
  const pitchRef = useRef(deckState.pitch);
  
  useEffect(() => {
    bpmRef.current = deckState.bpm;
    pitchRef.current = deckState.pitch;
  }, [deckState.bpm, deckState.pitch]);

  useEffect(() => {
    if (loadedTrack) {
      calculatedBpmRef.current = deckState.bpm;
      beatIntervalsRef.current = [];
      beatsTimestampsRef.current = [];
      beatConfidenceRef.current = 0;
    }
  }, [loadedTrack, deckState.bpm]);

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

  // Pre-seed scrolling waveform buffer on mount
  useEffect(() => {
    if (scrollWaveHistoryRef.current.length === 0) {
      scrollWaveHistoryRef.current = Array.from({ length: 220 }, () => ({
        amplitude: 0.05,
        low: 0.02,
        mid: 0.02,
        high: 0.01,
      }));
    }
  }, []);

  // Scrolling Waveform canvas rendering loop
  useEffect(() => {
    const canvas = scrollWaveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const analyser = analyserNodeRef.current;
    
    // Allocate data buffer for fast frame sampling
    const dArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const tArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const drawScrollWave = () => {
      animId = requestAnimationFrame(drawScrollWave);

      const width = canvas.width;
      const height = canvas.height;
      
      // 1. Parse active frequency / amplitude data if track is playing
      if (analyser && deckState.isPlaying && dArray) {
        analyser.getByteFrequencyData(dArray);
        
        // Lows: index 0 to 12 (~20Hz to 250Hz - heavy kicks and sub-bass)
        let lowSum = 0;
        const lowLimit = Math.min(13, dArray.length);
        for (let i = 1; i < lowLimit; i++) {
          lowSum += dArray[i];
        }
        const lowVal = (lowSum / (lowLimit - 1 || 1)) / 255;

        // Mids: index 13 to 60 (~250Hz to 1.2kHz - vocals, synths, and chords)
        let midSum = 0;
        const midLimit = Math.min(61, dArray.length);
        for (let i = 13; i < midLimit; i++) {
          midSum += dArray[i];
        }
        const midVal = (midSum / (midLimit - 13 || 1)) / 255;

        // Highs: index 61 to 180 (~1.2kHz to 3.8kHz - hi-hats, sizzle, brightness)
        let highSum = 0;
        const highLimit = Math.min(181, dArray.length);
        for (let i = 61; i < highLimit; i++) {
          highSum += dArray[i];
        }
        const highVal = (highSum / (highLimit - 61 || 1)) / 255;

        // Total Amplitude (overall volume level envelope)
        let ampSum = 0;
        for (let i = 0; i < dArray.length; i++) {
          ampSum += dArray[i];
        }
        const ampVal = (ampSum / (dArray.length || 1)) / 255;

        // Push new rolling point
        scrollWaveHistoryRef.current.push({
          amplitude: Math.max(0.04, ampVal),
          low: Math.max(0.02, lowVal),
          mid: Math.max(0.02, midVal),
          high: Math.max(0.01, highVal),
        });

        if (scrollWaveHistoryRef.current.length > 250) {
          scrollWaveHistoryRef.current.shift();
        }
      } else if (deckState.isPlaying) {
        // Fallback simulated wave movement if track is playing without initialized analyser node
        const mockAmp = 0.12 + Math.sin(Date.now() / 150) * 0.05 + Math.cos(Date.now() / 450) * 0.04;
        scrollWaveHistoryRef.current.push({
          amplitude: mockAmp,
          low: mockAmp * 0.65,
          mid: mockAmp * 0.45,
          high: mockAmp * 0.25,
        });
        if (scrollWaveHistoryRef.current.length > 250) {
          scrollWaveHistoryRef.current.shift();
        }
      }

      // Draw background slate deck
      ctx.fillStyle = "#030303";
      ctx.fillRect(0, 0, width, height);

      // Subtle horizontal gridline bars for DJ calibration
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      const numGridLines = 4;
      for (let i = 1; i < numGridLines; i++) {
        const y = (height / numGridLines) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Scrolling vertical ticks representing rhythmic grid intervals
      const gridScroll = deckState.isPlaying ? (Date.now() / 25) % 40 : 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
      for (let x = -gridScroll; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Draw the rolling frequency waveforms
      const history = scrollWaveHistoryRef.current;
      const totalPoints = history.length;
      if (totalPoints > 0) {
        const barWidth = width / 250;
        
        for (let i = 0; i < totalPoints; i++) {
          const slice = history[i];
          const x = i * barWidth;

          // Symmetric center vertical layouts
          const centerY = height / 2;
          const ampHeight = slice.amplitude * (height * 0.82);
          
          if (ampHeight > 2) {
            // Symmetrical layers mapped by frequencies:
            // 1. Overall volume backing (soft tint)
            ctx.fillStyle = id === "A" ? "rgba(249, 115, 22, 0.12)" : "rgba(59, 130, 246, 0.12)";
            ctx.fillRect(x, centerY - ampHeight / 2, Math.max(1, barWidth - 0.25), ampHeight);

            // 2. Midrange backing (greenish highlights)
            const midHeight = slice.mid * (height * 0.55);
            ctx.fillStyle = "rgba(16, 185, 129, 0.6)";
            ctx.fillRect(x, centerY - midHeight / 2, Math.max(1, barWidth - 0.25), midHeight);

            // 3. Bass low-end prominence (heavy orange for A, heavy blue for B)
            const lowHeight = slice.low * (height * 0.4);
            ctx.fillStyle = id === "A" ? "#f97316" : "#3b82f6";
            ctx.fillRect(x, centerY - lowHeight / 2, Math.max(1, barWidth - 0.25), lowHeight);

            // 4. White central transient energy core spike line
            const coreHeight = Math.min(4, ampHeight * 0.12);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(x, centerY - coreHeight / 2, Math.max(1, barWidth - 0.25), coreHeight);
          } else {
            // Squeezed idle state line
            ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
            ctx.fillRect(x, centerY - 1, Math.max(1, barWidth - 0.25), 2);
          }
        }
      }

      // Draw real-time time-domain audio peaks (oscilloscope wave) over the background
      if (analyser && deckState.isPlaying && tArray) {
        analyser.getByteTimeDomainData(tArray);
        
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = id === "A" ? "rgba(255, 237, 213, 0.9)" : "rgba(219, 234, 254, 0.9)";
        
        // Add subtle glow effect
        ctx.shadowBlur = 4;
        ctx.shadowColor = id === "A" ? "#f97316" : "#3b82f6";
        
        ctx.beginPath();
        
        const sliceWidth = width / tArray.length;
        let x = 0;
        
        for (let i = 0; i < tArray.length; i++) {
          const v = tArray[i] / 128.0;          
          const y = (v * height) / 2;
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        
        ctx.stroke();
        
        // Reset shadow for next generic frame
        ctx.shadowBlur = 0;
      }
    };

    drawScrollWave();
    
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyserNodeRef.current, deckState.isPlaying, id]);

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
      // Modulate both velocity & pitch like classic vinyl, adding temporary pitch bend nudge (+/- 3%)
      audio.playbackRate = Math.max(0.1, deckState.pitch + nudge);
    }
  }, [deckState.pitch, nudge, audioRef.current]);

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

      // --- BEAT REPEAT (STUTTER ROLL) AUDIO LOOP WRAPPING ---
      const audioEl = audioRef.current;
      if (audioEl && isBeatRepeatActiveRef.current && deckState.isPlaying) {
        const loopLengthSeconds = 60 / bpmRef.current; // 1/4 bar in a 4/4 meter is equivalent to 1 beat duration in seconds
        const elapsed = audioEl.currentTime - beatRepeatStartRef.current;
        if (elapsed >= loopLengthSeconds || elapsed < 0) {
          audioEl.currentTime = beatRepeatStartRef.current;
        }
      }

      // Simple bar visualizer back lights
      if (analyser && deckState.isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const intensity = average / 140; // Normalize volume scaling

        // --- POST-FADER REAL-TIME DB VU SCALE ANALYSIS ---
        const timeDomainData = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(timeDomainData);
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normVal = (timeDomainData[i] - 128) / 128;
          sumSquares += normVal * normVal;
        }
        const rmsVal = Math.sqrt(sumSquares / (bufferLength || 1));
        
        let dbVal = -Infinity;
        if (rmsVal > 0.0001) {
          dbVal = 20 * Math.log10(rmsVal); // standard dB convert
        }

        // Apply volume fader level to make VU meter post-volume-fader:
        const postFaderDbVal = dbVal + 20 * Math.log10(Math.max(0.0001, deckState.volume));

        // Mapping from db scale (-40dB to +3dB) to percentage
        const dbMinVal = -40;
        const dbMaxVal = 3;
        let vUPercent = 0;
        if (postFaderDbVal > dbMinVal) {
          vUPercent = ((postFaderDbVal - dbMinVal) / (dbMaxVal - dbMinVal)) * 100;
          vUPercent = Math.min(100, Math.max(0, vUPercent));
        }

        const isClippingValue = postFaderDbVal >= -0.5;

        // Perform fast direct-DOM style/text changes to avoid heavy React state updates
        if (vuMeterColorRef.current) {
          vuMeterColorRef.current.style.height = `${vUPercent}%`;
          if (isClippingValue) {
            vuMeterColorRef.current.style.background = 'linear-gradient(to top, #22c55e 0%, #eab308 65%, #ef4444 90%)';
          } else {
            vuMeterColorRef.current.style.background = 'linear-gradient(to top, #22c55e 0%, #eab308 100%)';
          }
        }

        if (vuLevelTextRef.current) {
          if (postFaderDbVal === -Infinity || isNaN(postFaderDbVal) || postFaderDbVal < -100) {
            vuLevelTextRef.current.innerText = "-inf dB";
            vuLevelTextRef.current.className = "text-[7.5px] font-mono text-zinc-550";
          } else {
            vuLevelTextRef.current.innerText = `${postFaderDbVal.toFixed(1)} dB`;
            if (isClippingValue) {
              vuLevelTextRef.current.className = "text-[7.5px] font-mono text-rose-500 font-black animate-pulse";
            } else {
              vuLevelTextRef.current.className = "text-[7.5px] font-mono text-zinc-400 font-bold";
            }
          }
        }

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

        // --- REALTIME BPM DETECTION AND BEAT DENSITY MATH ---
        // Bass/Kick transient analysis: low bins 1 to 5 (~40Hz to ~180Hz)
        let lowEnergy = 0;
        const lowBinsCount = Math.min(6, bufferLength);
        if (lowBinsCount > 1) {
          for (let i = 1; i < lowBinsCount; i++) {
            lowEnergy += dataArray[i];
          }
          lowEnergy = lowEnergy / (lowBinsCount - 1);
        }

        const rollingEnergy = rollingEnergyRef.current;
        const threshold = Math.max(70, rollingEnergy * 1.32);
        const now = performance.now();

        // Dynamically shift rolling energy
        rollingEnergyRef.current = rollingEnergy * 0.98 + lowEnergy * 0.02;

        let detectedBeat = false;
        const minCooldown = 60000 / 220; // Allow up to 220 BPM triggers
        if (lowEnergy > threshold && (now - lastBeatTimeRef.current) > minCooldown) {
          detectedBeat = true;
          const interval = now - lastBeatTimeRef.current;
          lastBeatTimeRef.current = now;

          // Track in rolling 3s window
          beatsTimestampsRef.current.push(now);

          // Realistic BPM intervals (250ms - 1200ms = 240 BPM - 50 BPM)
          if (interval >= 250 && interval <= 1200) {
            const intervals = beatIntervalsRef.current;
            intervals.push(interval);
            if (intervals.length > 8) {
              intervals.shift();
            }

            const avgInterval = intervals.reduce((sVal, vVal) => sVal + vVal, 0) / intervals.length;
            const variance = intervals.reduce((sVal, vVal) => sVal + Math.pow(vVal - avgInterval, 2), 0) / intervals.length;
            const stdDev = Math.sqrt(variance);

            const newConfidenceValue = Math.max(0, Math.min(100, 100 - (stdDev / 0.4)));
            beatConfidenceRef.current = newConfidenceValue;

            const estBpm = 60000 / avgInterval;
            if (newConfidenceValue > 35 && intervals.length >= 3) {
              // Smooth out reading
              calculatedBpmRef.current = calculatedBpmRef.current * 0.75 + estBpm * 0.25;
            } else if (intervals.length < 3) {
              calculatedBpmRef.current = bpmRef.current * pitchRef.current;
            }
          }
        }

        // Clean-up timestamps older than 3 seconds
        beatsTimestampsRef.current = beatsTimestampsRef.current.filter(ts => (now - ts) < 3000);
        const liveBeatDensity = beatsTimestampsRef.current.length / 3.0; // rate in beats/sec

        // Direct DOM Updates
        if (liveBpmTextRef.current) {
          if (beatConfidenceRef.current > 30 && beatIntervalsRef.current.length >= 3) {
            liveBpmTextRef.current.innerText = calculatedBpmRef.current.toFixed(1);
          } else {
            const staticBpmStr = (bpmRef.current * pitchRef.current).toFixed(1);
            liveBpmTextRef.current.innerText = `${staticBpmStr} (calc...)`;
          }
        }

        if (confidenceRef.current) {
          confidenceRef.current.innerText = `${beatConfidenceRef.current.toFixed(0)}%`;
          if (beatConfidenceRef.current > 75) {
            confidenceRef.current.className = "text-[10px] text-emerald-450 font-black";
          } else if (beatConfidenceRef.current > 40) {
            confidenceRef.current.className = "text-[10px] text-yellow-405 font-extrabold";
          } else {
            confidenceRef.current.className = "text-[10px] text-zinc-500 font-medium";
          }
        }

        if (beatPulseDotRef.current) {
          if (detectedBeat) {
            beatPulseDotRef.current.style.backgroundColor = id === "A" ? "#f97316" : "#3b82f6";
            beatPulseDotRef.current.style.transform = "scale(1.25)";
            beatPulseDotRef.current.style.boxShadow = id === "A" ? "0 0 14px #f97316" : "0 0 14px #3b82f6";
          } else {
            beatPulseDotRef.current.style.transform = "scale(1.0)";
            beatPulseDotRef.current.style.boxShadow = "none";
            beatPulseDotRef.current.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
          }
        }

        if (densityValueTextRef.current) {
          densityValueTextRef.current.innerText = `${liveBeatDensity.toFixed(1)} beats/s`;
        }

        if (densityBarRefs.current) {
          const numActiveSegs = Math.min(12, Math.round((liveBeatDensity / 2.2) * 12));
          densityBarRefs.current.forEach((barEl, barIdx) => {
            if (barEl) {
              if (barIdx < numActiveSegs) {
                if (barIdx < 6) {
                  barEl.style.backgroundColor = id === "A" ? "#f97316" : "#3b82f6";
                } else if (barIdx < 9) {
                  barEl.style.backgroundColor = id === "A" ? "#ea580c" : "#2563eb";
                } else {
                  barEl.style.backgroundColor = "#ef4444";
                }
              } else {
                barEl.style.backgroundColor = "#18181b";
              }
            }
          });
        }

      } else {
        ctx.fillStyle = "#334155";
        ctx.fillRect(2, height - 3, 6, 3);
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "#475569";
        ctx.fillText(`READY`, 5, 12);

        // paused/stopped direct DOM fallbacks
        if (vuMeterColorRef.current) {
          vuMeterColorRef.current.style.height = '0%';
          vuMeterColorRef.current.style.background = 'transparent';
        }
        if (vuLevelTextRef.current) {
          vuLevelTextRef.current.innerText = "-inf dB";
          vuLevelTextRef.current.className = "text-[7.5px] font-mono text-zinc-550";
        }

        if (liveBpmTextRef.current) {
          const staticBpmStr = (bpmRef.current * pitchRef.current).toFixed(1);
          liveBpmTextRef.current.innerText = `${staticBpmStr} (paused)`;
        }
        if (confidenceRef.current) {
          confidenceRef.current.innerText = "0%";
          confidenceRef.current.className = "text-[10px] text-zinc-500 font-medium";
        }
        if (beatPulseDotRef.current) {
          beatPulseDotRef.current.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
          beatPulseDotRef.current.style.transform = "scale(1.0)";
          beatPulseDotRef.current.style.boxShadow = "none";
        }
        if (densityValueTextRef.current) {
          densityValueTextRef.current.innerText = "0.0 beats/s";
        }
        if (densityBarRefs.current) {
          densityBarRefs.current.forEach((barEl) => {
            if (barEl) barEl.style.backgroundColor = "#18181b";
          });
        }
      }
    };

    drawLevel();
    return () => {
      cancelAnimationFrame(levelAnimFrame);
    };
  }, [analyserNodeRef.current, deckState.isPlaying, id]);

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
    } rounded-2xl flex flex-col justify-between relative shadow-2xl ${
      compact ? "p-3 xl:p-4 h-full gap-2 min-h-0" : "p-6 gap-6"
    }`}>
      
      {/* Decorative Deck Label Grid */}
      <div className="absolute top-3 left-4 flex items-center gap-1.5 select-none">
        <span className={`w-2.5 h-2.5 rounded-full ${id === "A" ? "bg-orange-500 shadow-orange-500/80 animate-pulse" : "bg-blue-500 shadow-blue-500/80 animate-pulse"}`} />
        <span className="text-[10px] font-black tracking-widest text-[#555] uppercase">DECK {id}</span>
      </div>

      <div className="absolute top-3 right-4">
        <canvas ref={canvasRef} width={64} height={18} className="bg-[#050505] border border-white/5 rounded opacity-80" />
      </div>

      {/* Dynamic Scrolling Frequency Waveform Component with Integrated Metadata HUD */}
      <div className={`relative w-full bg-[#050505] border border-white/5 rounded-xl overflow-hidden shadow-inner flex items-center select-none group transition-all ${
        compact ? "h-14 mt-2" : "mt-4 h-24"
      }`}>
        {/* Scrolling Waveform Canvas */}
        <canvas 
          ref={scrollWaveCanvasRef} 
          width={400}
          height={compact ? 56 : 96}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Transparent dark gradient vignette */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-black/85 pointer-events-none" />

        {/* Dynamic Metadata HUD Overlay */}
        <div className={`absolute inset-0 flex flex-col justify-between pointer-events-none z-10 ${
          compact ? "p-1.5" : "p-3"
        }`}>
          {/* Top HUD Row */}
          <div className="flex justify-between items-start">
            <div className={`bg-black/75 backdrop-blur-xs rounded-md border border-white/5 max-w-[65%] ${
              compact ? "px-1.5 py-0.5" : "px-2.5 py-1"
            }`}>
              {loadedTrack ? (
                <>
                  <h3 className={`font-black tracking-wide uppercase line-clamp-1 ${compact ? "text-[10px]" : "text-xs"} ${id === "A" ? "text-orange-500" : "text-blue-400"}`}>
                    {loadedTrack.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-bold text-zinc-300 line-clamp-1 ${compact ? "text-[8.5px]" : "text-[10px]"}`}>{loadedTrack.artist}</p>
                    {deckState.detectedKey && (
                      <span className={`px-1 py-0.5 rounded bg-black/60 border border-white/10 font-mono font-black text-[8.5px] tracking-wide flex items-center leading-none select-none ${
                        id === "A" ? "text-orange-405 text-orange-400" : "text-blue-405 text-blue-400"
                      } ${deckState.isKeyAnalyzing ? "animate-pulse" : ""}`} title={deckState.isKeyAnalyzing ? "Analyzing musical key" : `Musical key: ${deckState.detectedKey}`}>
                        {deckState.isKeyAnalyzing ? "🔑 ANALYZING..." : `🎵 ${deckState.detectedKey}`}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`font-black text-zinc-500 uppercase tracking-widest italic ${compact ? "text-[9px]" : "text-xs"}`}>NO TRACK LOADED</h3>
                  <p className={`text-zinc-650 ${compact ? "text-[7.5px]" : "text-[9px]"}`}>Select song to begin scrolling wave</p>
                </>
              )}
            </div>

            <div className={`flex flex-col items-end gap-0.5 font-mono ${compact ? "text-[7.5px]" : "text-[8.5px]"}`}>
              <div className={`bg-black/75 backdrop-blur-xs rounded border border-white/5 flex gap-1 items-center font-bold text-emerald-400 uppercase ${
                compact ? "px-1" : "px-2 py-0.5"
              }`}>
                <span className={`rounded-full bg-emerald-400 ${
                  compact ? "w-1 h-1" : "w-1.5 h-1.5"
                } ${deckState.isPlaying ? 'animate-ping' : ''}`} />
                <span>SCROLLING WAVE</span>
              </div>
              {!compact && (
                <div className="bg-black/75 backdrop-blur-xs px-2 py-0.5 rounded border border-white/5 text-zinc-405 font-bold hidden sm:block">
                  RED=BASS | GRN=MID | BLU=TREBLE
                </div>
              )}
            </div>
          </div>

          {/* Bottom HUD Row */}
          <div className="flex justify-between items-end">
            {/* Playback time counters */}
            <div className={`bg-black/80 backdrop-blur-xs rounded border border-white/5 font-mono font-black flex items-center text-gray-300 ${
              compact ? "px-1.5 py-0.5 text-[10px] gap-1" : "px-2 py-1 text-xs gap-1.5"
            }`}>
              <span className={id === "A" ? "text-orange-500" : "text-blue-400"}>
                {formatTime(deckState.currentTime)}
              </span>
              <span className="text-zinc-650">/</span>
              <span className="text-zinc-450">
                {formatTime(deckState.duration)}
              </span>
            </div>

            {/* Scroll status */}
            {loadedTrack && (
              <div className={`bg-black/80 backdrop-blur-xs rounded border border-white/5 font-mono font-bold text-zinc-400 uppercase ${
                compact ? "px-1 text-[7.5px]" : "px-2 py-1 text-[8px]"
              }`}>
                {deckState.isPlaying ? `${(deckState.pitch * 100).toFixed(0)}%` : "PAUSED"}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Center Playhead alignment marker lines */}
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-[#ef4444] opacity-55 z-10 pointer-events-none shadow-[0_0_8px_#ef4444]" />
        <div className="absolute top-1/2 -translate-y-1/2 left-[calc(50%-4px)] w-2.5 h-2.5 rotate-45 border-r border-b border-rose-500 opacity-75 z-10 pointer-events-none" />
      </div>

      {/* Deck Layout Grid - Vinyl Platter left, Pitch Control right */}
      <div className={`flex items-center justify-between bg-[#050505]/40 rounded-xl border border-white/5 ${
        compact ? "p-2 gap-2" : "p-4 gap-6"
      }`}>
        
        {/* Virtual vinyl platter */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
          
          {/* Realtime BPM & Rhythmic Beat Density display */}
          <div className={`w-full bg-[#050505]/75 border border-white/5 rounded-xl p-2.5 flex flex-col gap-1.5 select-none text-[10px] ${
            compact ? "hidden" : "mb-3.5"
          }`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5 font-bold tracking-wider text-zinc-400 uppercase">
                <Activity className={`h-3 w-3 ${deckState.isPlaying ? 'text-orange-500 animate-pulse' : 'text-zinc-650'}`} />
                <span>BPM DETECTOR / TRACKER</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">CONFID:</span>
                <span ref={confidenceRef} className="text-[10px] text-zinc-500 font-bold">0%</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-1 font-mono">
                <span ref={liveBpmTextRef} className="text-lg font-black tracking-tighter text-white">---.-</span>
                <span className="text-[8px] text-zinc-550 font-bold uppercase">EST</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-zinc-550 font-bold uppercase font-mono">BEAT PULSE</span>
                <div
                  ref={beatPulseDotRef}
                  className="w-3.5 h-3.5 rounded-full border border-white/5 transition-all duration-75"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                />
              </div>
            </div>

            {/* Density LED Segment Grid */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[8px] font-mono font-bold text-zinc-500">
                <span>RHYTHMIC DENSITY</span>
                <span ref={densityValueTextRef}>0.0 beats/s</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-white/5 flex gap-0.5 p-0.5 animate-pulse-[duration:2s]">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div
                    key={idx}
                    ref={(el) => {
                      if (densityBarRefs.current) {
                        densityBarRefs.current[idx] = el;
                      }
                    }}
                    className="flex-1 h-full rounded-xs transition-colors duration-200"
                    style={{ backgroundColor: "#18181b" }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div
            id={`platter-${id}`}
            ref={platterRef}
            onMouseDown={handleScratchStart}
            style={{ transform: `rotate(${platterAngle}deg)` }}
            className={`rounded-full bg-[#050505] border-[6px] border-zinc-900 shadow-xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none relative transition-all duration-300 ${
              deckState.isPlaying ? (id === "A" ? "shadow-orange-500/5" : "shadow-blue-500/5") : ""
            } ${compact ? "w-24 h-24" : "w-40 h-40 md:w-44 md:h-44"}`}
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
              <div className={`rounded-full bg-[#0a0a0a] border border-zinc-900 flex items-center justify-center shadow-inner relative ${
                compact ? "w-10 h-10" : "w-16 h-16"
              }`}>
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
          
          <span className={`text-zinc-500 font-mono text-center uppercase tracking-tight select-none ${
            compact ? "text-[8px] mt-1" : "text-[10px] mt-2"
          }`}>
            {compact ? "SCRATCH" : "DRAG DISC TO SCRATCH"}
          </span>
        </div>

        {/* Pitch / BPM adjust section */}
        <div className={`flex flex-col items-center justify-between bg-[#050505] rounded-xl border border-white/5 text-center relative select-none ${
          compact ? "h-32 p-1.5 w-14" : "h-44 p-3 w-20"
        }`}>
          {/* Output BPM */}
          <div className={compact ? "" : "mb-2"}>
            <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest leading-none">BPM</p>
            <p className={`font-black text-gray-200 font-mono mt-0.5 ${compact ? "text-xs" : "text-sm"}`}>{dynamicBpm}</p>
          </div>

          {/* Vertical pitch slider */}
          <div className={`relative flex items-center justify-center w-8 min-h-0 ${compact ? "h-14" : "h-24"}`}>
            <input
              id={`pitch-slider-${id}`}
              type="range"
              min="0.9"
              max="1.1"
              step="0.001"
              value={deckState.pitch}
              onChange={(e) => updateDeckState(id, { pitch: parseFloat(e.target.value) })}
              className={`fader-range absolute bg-zinc-850 rounded-full appearance-none outline-none cursor-ns-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)] ${
                compact ? "w-14" : "w-24"
              } h-1`}
              style={{ transform: "rotate(-90deg)" }}
            />
            {/* Center zero detent mark */}
            <div className="absolute top-1/2 left-0 right-0 h-1 border-t border-zinc-800 pointer-events-none" />
          </div>

          {/* Reset Pitch */}
          <button
            id={`reset-pitch-${id}`}
            onClick={() => updateDeckState(id, { pitch: 1.0 })}
            className={`font-bold text-gray-400 hover:text-white flex items-center gap-0.5 ${compact ? "text-[8px] mt-1" : "text-[10px] mt-2"}`}
            title="Reset Pitch (0.0%)"
          >
            <RefreshCw className="h-2 w-2" />
            {( (deckState.pitch - 1.0) * 100 ).toFixed(1)}%
          </button>

          {/* Temporary pitch bend (+/- 3%) nudging controls */}
          {!compact && (
            <div className="flex gap-1 mt-1.5 w-full">
              <button
                id={`nudge-down-${id}`}
                onMouseDown={() => setNudge(-0.03)}
                onMouseUp={() => setNudge(0)}
                onMouseLeave={() => setNudge(0)}
                onTouchStart={() => setNudge(-0.03)}
                onTouchEnd={() => setNudge(0)}
                className="flex-1 py-1 text-[8px] font-black bg-[#151515] hover:bg-zinc-900 active:bg-orange-500 active:text-slate-950 border border-white/5 text-zinc-400 hover:text-white rounded transition-all cursor-pointer leading-none"
                title="Temporary slowdown pitch bend nudge (-3%)"
              >
                -3%
              </button>
              <button
                id={`nudge-up-${id}`}
                onMouseDown={() => setNudge(0.03)}
                onMouseUp={() => setNudge(0)}
                onMouseLeave={() => setNudge(0)}
                onTouchStart={() => setNudge(0.03)}
                onTouchEnd={() => setNudge(0)}
                className="flex-1 py-1 text-[8px] font-black bg-[#151515] hover:bg-zinc-900 active:bg-orange-500 active:text-slate-950 border border-white/5 text-zinc-400 hover:text-white rounded transition-all cursor-pointer leading-none"
                title="Temporary speedup pitch bend nudge (+3%)"
              >
                +3%
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Channel Volume Strip with Integrated dB scale VU meter */}
        <div className={`flex flex-col items-center justify-between bg-[#050505] rounded-xl border border-white/5 text-center relative select-none ${
          compact ? "h-32 p-1.5 w-14" : "h-44 p-3 w-20"
        }`}>
          <div className={compact ? "" : "mb-2"}>
            <p className="text-[8px] text-zinc-400 font-extrabold uppercase tracking-widest leading-none">VOL</p>
            <p className="text-[9px] font-bold text-gray-300 font-mono mt-0.5">{(deckState.volume * 100).toFixed(0)}%</p>
          </div>

          <div className="relative flex-1 flex flex-col items-center justify-center w-full">
            <input
              id={`deck-volume-fader-${id}`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckState.volume}
              onChange={(e) => updateDeckState(id, { volume: parseFloat(e.target.value) })}
              className={`vertical-slider w-1 bg-zinc-850 rounded-full appearance-none outline-none cursor-ns-resize ${
                compact ? "h-12" : "h-20"
              }`}
              style={{ WebkitAppearance: "none", writingMode: "bt-lr" } as any}
            />
          </div>

          {/* Real-time DB scale VU meter directly below volume fader */}
          <div className="w-full mt-1 flex flex-col items-center gap-0.5">
            <div className={`bg-zinc-950 rounded flex flex-col gap-0.5 p-0.5 border border-white/10 relative overflow-hidden ${
              compact ? "h-6 w-2.5" : "h-10 w-3"
            }`}>
              <div ref={vuMeterColorRef} className="w-full absolute bottom-0 left-0 right-0 bg-transparent transition-all duration-75 origin-bottom" style={{ height: '0%' }} />
              {/* Clipping high zone line */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-rose-500 opacity-20 border-b border-black" title="Clipping Warning Area" />
            </div>
            <span ref={vuLevelTextRef} className={`text-[7px] font-mono font-black text-zinc-500 tracking-tight leading-none ${compact ? "hidden" : "mt-0.5"}`}>-inf dB</span>
          </div>
        </div>
      </div>

      {/* Interactive Waveform Display Row */}
      <div className="flex flex-col gap-0.5 select-none">
        {!compact && <span className="text-[10px] text-zinc-550 font-black tracking-widest uppercase">Visual Beats Timeline / Waveform</span>}
        <div
          id={`waveform-track-${id}`}
          onClick={handleWaveformClick}
          className={`relative bg-[#050505] border border-white/5 rounded-xl overflow-hidden cursor-pointer flex items-center px-1 transition-all ${
            compact ? "h-8" : "h-12"
          }`}
        >
          {customWaveformPeaks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-550 font-semibold tracking-wider uppercase">
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
      <div className="flex flex-col gap-1 select-none">
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-[#555] font-black tracking-widest uppercase flex items-center gap-1">
            <Layers className="h-3 w-3" /> AUTO LOOP
          </span>
          {deckState.isLooping && (
            <span className="text-[9px] text-orange-550 font-bold uppercase tracking-wider animate-pulse font-mono">
              LOOP IN: {deckState.loopLength}B
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 4, 8].map((beats) => {
            const isLoopActive = deckState.isLooping && deckState.loopLength === beats;
            return (
              <button
                id={`loop-btn-${id}-${beats}`}
                key={beats}
                onClick={() => toggleLoop(beats)}
                className={`py-1 text-xs font-bold font-mono rounded-lg transition-all border cursor-pointer ${
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

        {/* Beat Repeat 1/4 Bar Stutter roll button */}
        {!compact && (
          <button
            id={`beat-repeat-btn-${id}`}
            onClick={handleBeatRepeatToggle}
            disabled={!loadedTrack}
            className={`w-full py-2 mt-1.5 text-xs font-black tracking-widest uppercase rounded-lg border transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              !loadedTrack
                ? "bg-[#050505] text-zinc-700 border-white/5 cursor-not-allowed"
                : isBeatRepeat
                ? "bg-rose-600 border-rose-500 text-white animate-pulse"
                : "bg-[#050505] hover:bg-zinc-900 text-rose-500 border-rose-600/20"
            }`}
            title="Stutter loop a 1/4 bar section continuously (1 beat)"
          >
            <Activity className={`h-3 w-3 ${isBeatRepeat ? "animate-spin" : ""}`} />
            <span>BEAT REPEAT (1/4 BAR)</span>
          </button>
        )}
      </div>

      {/* Play, Cue, Sync Control Button block */}
      <div className={`grid grid-cols-3 gap-2 border-t border-white/5 select-none ${
        compact ? "pt-2" : "pt-4"
      }`}>
        {/* Play/Pause Button */}
        <button
          id={`play-btn-${id}`}
          onClick={togglePlay}
          disabled={!loadedTrack}
          className={`rounded-xl flex items-center justify-center font-bold text-sm shadow transition-all cursor-pointer ${
            compact ? "h-8" : "h-11"
          } ${
            !loadedTrack
              ? "bg-[#050505] text-zinc-700 border border-white/5 cursor-not-allowed"
              : deckState.isPlaying
              ? "bg-rose-600 text-white hover:bg-rose-500 scale-[0.98]"
              : id === "A"
              ? "bg-orange-500 hover:bg-orange-600 text-slate-950"
              : "bg-blue-600 hover:bg-blue-500 text-white font-bold"
          }`}
        >
          {deckState.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>

        {/* CDJ CUE Button - Sets checkpoint/jumps back on hold */}
        <button
          id={`cue-btn-${id}`}
          onClick={triggerCue}
          disabled={!loadedTrack}
          className={`rounded-xl flex items-center justify-center font-black text-xs font-mono tracking-widest border transition-all cursor-pointer ${
            compact ? "h-8" : "h-11"
          } ${
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
          className={`rounded-xl flex items-center justify-center text-xs font-black tracking-wider uppercase border gap-1 transition-all cursor-pointer ${
            compact ? "h-8" : "h-11"
          } ${
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
