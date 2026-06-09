/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { DeckState } from "../types";
import { SlidersHorizontal, Sliders, Volume2, Waves } from "lucide-react";

interface MixerProps {
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number; // -1 to 1
  masterVolume: number; // 0 to 1
  fxDelay: number; // 0 to 1
  fxDelayTime: number; // 0.1 to 1.0
  fxReverb: number; // 0 to 1
  onChangeKnob: (deckId: "A" | "B" | "Master", param: string, value: number) => void;
}

export default function Mixer({
  deckA,
  deckB,
  crossfader,
  masterVolume,
  fxDelay,
  fxDelayTime,
  fxReverb,
  onChangeKnob,
}: MixerProps) {
  
  // Custom dial render helper (creates fully styled Pioneer silver-top knobs)
  const renderDial = (
    label: string,
    deckId: "A" | "B",
    param: "eqHigh" | "eqMid" | "eqLow" | "filterVal",
    min: number,
    max: number,
    value: number,
    colorAccent: string
  ) => {
    // Calculate rotation angle matching knob position
    const percentage = (value - min) / (max - min);
    const angle = -135 + percentage * 270; // 270 degree rotation range

    return (
      <div className="flex flex-col items-center gap-1 group select-none">
        <span className="text-[9px] text-zinc-500 font-black tracking-widest uppercase">{label}</span>
        
        {/* Hardware Knob Body wrapper */}
        <div className="relative w-11 h-11 bg-[#050505] border-2 border-white/5 rounded-full flex items-center justify-center shadow-lg cursor-ns-resize hover:border-[#333] transition-colors">
          
          {/* Knob face rotation anchor */}
          <div
            className="w-full h-full relative flex items-center justify-center transition-transform duration-75"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            {/* Center tick indicator mark */}
            <div className={`absolute top-0 w-0.5 h-2.5 rounded-full ${colorAccent}`} />
            {/* Silver cap gradient reflection shadow */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700 shadow flex items-center justify-center" />
          </div>

          {/* Quick value display overlay on hover */}
          <div className="absolute inset-0 bg-[#050505]/95 rounded-full opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
            <span className="text-[9px] font-mono font-bold text-gray-300">
              {param === "filterVal" 
                ? (value > 0 ? `HPF` : value < 0 ? `LPF` : `FLT`)
                : `${value > 0 ? "+" : ""}${value.toFixed(0)}`}
            </span>
          </div>
        </div>

        {/* Input slider backing hidden but accessible for click dragging or fallback */}
        <input
          id={`dial-slider-${deckId}-${param}`}
          type="range"
          min={min}
          max={max}
          step={param === "filterVal" ? "1" : "0.5"}
          value={value}
          onChange={(e) => onChangeKnob(deckId, param, parseFloat(e.target.value))}
          className="w-12 h-1 bg-transparent opacity-45 rounded appearance-none cursor-pointer focus:outline-none focus:opacity-100 slider-accent-gray"
        />
      </div>
    );
  };

  return (
    <div id="dj-hardware-mixer" className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 flex flex-col justify-between gap-6 shadow-2xl">
      
      {/* Hardware Panel Title */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="text-orange-500 h-5 w-5" />
          <h2 className="text-xl font-semibold text-gray-200 uppercase tracking-wider">MIXER CONSOLE</h2>
        </div>
        <span className="text-[10px] bg-[#050505] font-mono text-zinc-400 px-2 py-0.5 rounded border border-white/5">
          PRO-DJ EQ ENGINE
        </span>
      </div>

      {/* 3-Band Equalizer & sweeping filters columns */}
      <div className="grid grid-cols-2 gap-8 bg-[#111] p-4 rounded-xl border border-white/5">
        
        {/* DECK A EQ Column */}
        <div className="flex flex-col gap-5 items-center border-r border-white/5 pr-4">
          <span className="text-[10px] font-bold text-orange-500 tracking-widest uppercase">CHANNEL A EQ</span>
          <div className="grid grid-cols-3 gap-3 w-full justify-items-center">
            {renderDial("HIGH", "A", "eqHigh", -12, 12, deckA.eqHigh, "bg-orange-500")}
            {renderDial("MID", "A", "eqMid", -12, 12, deckA.eqMid, "bg-orange-500")}
            {renderDial("LOW", "A", "eqLow", -12, 12, deckA.eqLow, "bg-orange-500")}
          </div>
          {renderDial("FILTER", "A", "filterVal", -100, 100, deckA.filterVal, "bg-orange-500")}
        </div>

        {/* DECK B EQ Column */}
        <div className="flex flex-col gap-5 items-center pl-4">
          <span className="text-[10px] font-bold text-blue-400 tracking-widest uppercase">CHANNEL B EQ</span>
          <div className="grid grid-cols-3 gap-3 w-full justify-items-center">
            {renderDial("HIGH", "B", "eqHigh", -12, 12, deckB.eqHigh, "bg-blue-400")}
            {renderDial("MID", "B", "eqMid", -12, 12, deckB.eqMid, "bg-blue-400")}
            {renderDial("LOW", "B", "eqLow", -12, 12, deckB.eqLow, "bg-blue-400")}
          </div>
          {renderDial("FILTER", "B", "filterVal", -100, 100, deckB.filterVal, "bg-blue-400")}
        </div>

      </div>

      {/* FX controls panel & Volume Sliders Section */}
      <div className="grid grid-cols-3 gap-4 items-stretch bg-[#050505]/20 border border-white/5 p-4 rounded-xl">
        
        {/* Channel A volume fader */}
        <div className="flex flex-col items-center justify-between gap-2.5 select-none text-center">
          <span className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">FADER A</span>
          <div className="relative flex-1 flex flex-col items-center justify-center">
            <input
              id="volume-fader-a"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckA.volume}
              onChange={(e) => onChangeKnob("A", "volume", parseFloat(e.target.value))}
              className="vertical-slider h-28 w-1.5 bg-[#050505] rounded-full appearance-none outline-none cursor-ns-resize"
              style={{ WebkitAppearance: "none", writingMode: "bt-lr" } as any}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-500">{(deckA.volume * 100).toFixed(0)}%</span>
        </div>

        {/* MASTER FX SECTION */}
        <div className="flex flex-col justify-between border-x border-[#222] px-3 py-1 space-y-4">
          <span className="text-[10px] text-zinc-400 font-black tracking-widest uppercase text-center flex items-center justify-center gap-1">
            <Waves className="h-3.5 w-3.5 text-orange-500 animate-pulse" /> FX ASSIGN LOOP
          </span>

          {/* Reverb controls */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-semibold text-zinc-500 font-mono">
              <span>REVERB DEPTH</span>
              <span>{(fxReverb * 100).toFixed(0)}%</span>
            </div>
            <input
              id="fx-reverb-slider"
              type="range"
              min="0"
              max="0.8"
              step="0.01"
              value={fxReverb}
              onChange={(e) => onChangeKnob("Master", "fxReverb", parseFloat(e.target.value))}
              className="w-full h-1 bg-[#050505] rounded-full appearance-none cursor-pointer slider-accent-amber"
            />
          </div>

          {/* Delay controls */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-semibold text-zinc-500 font-mono">
              <span>DELAY FEEDBACK</span>
              <span>{(fxDelay * 100).toFixed(0)}%</span>
            </div>
            <input
              id="fx-delay-slider"
              type="range"
              min="0"
              max="0.8"
              step="0.01"
              value={fxDelay}
              onChange={(e) => onChangeKnob("Master", "fxDelay", parseFloat(e.target.value))}
              className="w-full h-1 bg-[#050505] rounded-full appearance-none cursor-pointer slider-accent-amber"
            />
          </div>

          {/* Delay Time Interval select */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-semibold text-zinc-500 font-mono">
              <span>ECHO SPEED</span>
              <span>{(fxDelayTime).toFixed(2)}s</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[0.25, 0.5, 0.75].map((timeVal) => (
                <button
                  id={`fx-delay-time-btn-${timeVal}`}
                  key={timeVal}
                  onClick={() => onChangeKnob("Master", "fxDelayTime", timeVal)}
                  className={`py-1 text-[9px] font-bold rounded-md font-mono border ${
                    fxDelayTime === timeVal 
                      ? "bg-orange-500 text-slate-950 border-orange-400" 
                      : "bg-[#050505] text-zinc-400 border-white/5"
                  }`}
                >
                  {timeVal === 0.25 ? "1/8" : timeVal === 0.5 ? "1/4" : "1/2"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Channel B volume fader */}
        <div className="flex flex-col items-center justify-between gap-2.5 select-none text-center">
          <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">FADER B</span>
          <div className="relative flex-1 flex flex-col items-center justify-center">
            <input
              id="volume-fader-b"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckB.volume}
              onChange={(e) => onChangeKnob("B", "volume", parseFloat(e.target.value))}
              className="vertical-slider h-28 w-1.5 bg-[#050505] rounded-full appearance-none outline-none cursor-ns-resize"
              style={{ WebkitAppearance: "none", writingMode: "bt-lr" } as any}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-500">{(deckB.volume * 100).toFixed(0)}%</span>
        </div>

      </div>

      {/* Crossfader Slide Control Row */}
      <div className="space-y-3 bg-[#050505]/40 p-4 rounded-xl border border-white/5">
        <div className="flex justify-between items-center select-none">
          <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-widest flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3 text-orange-500" /> DECK A (LEFT)
          </span>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest font-mono">
            {crossfader === 0 ? "CENTRE MIX" : crossfader < 0 ? `DECK A (${Math.abs(crossfader * 100).toFixed(0)}%)` : `DECK B (${Math.abs(crossfader * 100).toFixed(0)}%)`}
          </span>
          <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-widest flex items-center gap-1">
            DECK B (RIGHT) <SlidersHorizontal className="h-3 w-3 text-blue-450" />
          </span>
        </div>

        <div className="relative flex items-center w-full min-h-6">
          <input
            id="crossfader-fader"
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={crossfader}
            onChange={(e) => onChangeKnob("Master", "crossfader", parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#050505] rounded-full appearance-none cursor-ew-resize slider-accent-pioneer shadow-inner"
          />
          {/* Centering zero-detent line mark */}
          <div className="absolute left-1/2 -ml-0.5 w-1 h-3 bg-[#111] rounded pointer-events-none" />
        </div>
      </div>

      {/* Master Volume Output Control Row */}
      <div className="flex justify-between items-center gap-4 bg-[#050505]/80 p-3.5 rounded-xl border border-white/5">
        <div className="flex items-center gap-2 select-none shrink-0">
          <Sliders className="h-4 w-4 text-orange-500" />
          <span className="text-[10px] text-[#aaa] font-bold tracking-widest uppercase">MASTER OUT</span>
        </div>
        
        <input
          id="master-volume-slider"
          type="range"
          min="0"
          max="1.2"
          step="0.01"
          value={masterVolume}
          onChange={(e) => onChangeKnob("Master", "masterVolume", parseFloat(e.target.value))}
          className="flex-1 h-1.5 bg-[#111] rounded-full appearance-none cursor-pointer slider-accent-teal"
        />

        <span className="text-[10px] font-mono text-zinc-400 font-bold w-12 text-right">
          {(masterVolume * 100).toFixed(0)}%
        </span>
      </div>

    </div>
  );
}
