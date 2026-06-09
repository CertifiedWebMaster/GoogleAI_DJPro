/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { playSynthesizedSample } from "../utils/audioSynth";
import { SAMPLE_SOUNDS } from "../data";
import { Disc, Zap } from "lucide-react";

interface SampleGridProps {
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  samplerNodeRef: React.MutableRefObject<GainNode | null>;
  compact?: boolean;
}

export default function SampleGrid({ audioContextRef, samplerNodeRef, compact = false }: SampleGridProps) {
  const [activePad, setActivePad] = useState<string | null>(null);

  // Trigger sound logic
  const handleTrigger = (id: string, type: any) => {
    if (!audioContextRef.current || !samplerNodeRef.current) return;
    
    // Play synthesis
    playSynthesizedSample(audioContextRef.current, samplerNodeRef.current, type);
    
    // Ripple effect tracking
    setActivePad(id);
    setTimeout(() => {
      setActivePad((prev) => (prev === id ? null : prev));
    }, 150);
  };

  // Listen for keyboard hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.nodeName === "INPUT" ||
        target.nodeName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const pressedKey = e.key.toUpperCase();
      const matchedSample = SAMPLE_SOUNDS.find(
        (s) => s.hotkey === pressedKey || s.hotkey === e.key
      );

      if (matchedSample) {
        e.preventDefault();
        handleTrigger(matchedSample.id, matchedSample.type);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div id="dj-sampler-grid" className={`bg-[#0a0a0a] border border-white/10 rounded-2xl flex flex-col ${
      compact ? "p-3 h-[210px]" : "p-6 h-[270px]"
    }`}>
      
      {/* Header */}
      <div className={`flex justify-between items-center border-b border-white/5 ${
        compact ? "mb-1.5 pb-1.5" : "mb-4 pb-3"
      }`}>
        <div>
          <h2 className={`${compact ? "text-sm" : "text-xl"} font-semibold text-gray-200 flex items-center gap-1.5`}>
            <Disc className="text-orange-500 h-4.5 w-4.5 animate-spin-[duration:10s]" />
            Sampler Grid
          </h2>
          {!compact && (
            <span className="text-xs text-zinc-400">Trigger realtime synthesizers with keyboard letters below</span>
          )}
        </div>
        <div className="flex gap-1">
          <span className="px-1.5 py-0.5 text-[9px] bg-[#050505] font-mono text-orange-500 rounded-md border border-white/5">
            ZERO LATENCY
          </span>
        </div>
      </div>

      {/* Grid of 8 Pad Buttons */}
      <div className={`grid grid-cols-4 flex-1 pb-1 ${compact ? "gap-1.5" : "gap-3"}`}>
        {SAMPLE_SOUNDS.map((sample) => {
          const isActive = activePad === sample.id;
          return (
            <button
              id={`sample-pad-${sample.id}`}
              key={sample.id}
              onClick={() => handleTrigger(sample.id, sample.type)}
              className={`relative bg-[#111] hover:bg-[#151515] border border-white/5 hover:border-white/15 rounded-xl flex flex-col justify-between p-3 select-none overflow-hidden group transition-all cursor-pointer ${
                isActive ? "scale-[0.97]" : "hover:-translate-y-0.5 active:scale-95"
              }`}
            >
              {/* Highlight background glow on trigger */}
              {isActive && (
                <div className={`absolute inset-0 bg-gradient-to-br ${sample.color} opacity-40 blur-sm duration-75`} />
              )}
              
              <div className="flex justify-between items-start w-full z-10">
                {/* Hotkey identifier badge */}
                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                  isActive 
                    ? "bg-white/20 text-white border-white/35"
                    : "bg-[#050505] text-zinc-500 border-white/5 group-hover:text-orange-500 group-hover:border-orange-500/20"
                }`}>
                  {sample.hotkey}
                </span>

                <Zap className={`h-4 w-4 transition-colors ${
                  isActive ? "text-amber-400 shrink-0 animate-ping" : "text-zinc-650 group-hover:text-[#888]"
                }`} />
              </div>

              <div className="text-left w-full z-10">
                <p className={`text-xs font-bold leading-tight uppercase transition-colors truncate ${
                  isActive ? "text-white" : "text-gray-305"
                }`}>
                  {sample.name.split(" ")[1]}
                </p>
                <p className="text-[9px] text-[#444] font-medium group-hover:text-zinc-400 transition-colors uppercase tracking-wider">
                  {sample.type}
                </p>
              </div>

              {/* Glowing active outline border bar */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${sample.color} shadow-lg transition-opacity duration-200 ${
                isActive ? "opacity-100" : "opacity-30 group-hover:opacity-60"
              }`} />
            </button>
          );
        })}
      </div>

    </div>
  );
}
