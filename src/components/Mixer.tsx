/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import { DeckState } from "../types";
import { SlidersHorizontal, Sliders, Volume2, Waves, ShieldCheck } from "lucide-react";

interface MixerProps {
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number; // -1 to 1
  masterVolume: number; // 0 to 1
  fxDelay: number; // 0 to 1
  fxDelayTime: number; // 0.1 to 1.0
  fxReverb: number; // 0 to 1
  onChangeKnob: (deckId: "A" | "B" | "Master", param: string, value: number) => void;
  compact?: boolean;
  limiterEnabled?: boolean;
  onToggleLimiter?: () => void;
  eqBypass?: boolean;
  onToggleEqBypass?: () => void;
  analyserRefA?: React.MutableRefObject<AnalyserNode | null>;
  analyserRefB?: React.MutableRefObject<AnalyserNode | null>;
  masterAnalyserRef?: React.MutableRefObject<AnalyserNode | null>;
  crossfaderCurve?: "power" | "linear" | "cut";
  onToggleCrossfaderCurve?: () => void;
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
  compact = false,
  limiterEnabled = false,
  onToggleLimiter,
  eqBypass = false,
  onToggleEqBypass,
  analyserRefA,
  analyserRefB,
  masterAnalyserRef,
  crossfaderCurve = "power",
  onToggleCrossfaderCurve,
}: MixerProps) {
  
  const clipLightRefA = useRef<HTMLDivElement>(null);
  const clipLightRefB = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!masterAnalyserRef?.current || !svgRef.current) return;
    
    let animationFrameId: number;
    const analyser = masterAnalyserRef.current;
    const bufferLength = analyser.frequencyBinCount; 
    const dataArray = new Uint8Array(bufferLength);
    
    const svg = d3.select(svgRef.current);
    const numBars = Math.min(bufferLength, 64);

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      
      const width = svgRef.current?.clientWidth || 300;
      const height = svgRef.current?.clientHeight || 40;
      
      svg.attr("width", width).attr("height", height);

      analyser.getByteFrequencyData(dataArray);
      
      const slicedData = Array.from(dataArray).slice(0, numBars);
      
      const xScale = d3.scaleBand()
        .domain(d3.range(numBars).map(String))
        .range([0, width])
        .padding(0.1);
        
      const yScale = d3.scaleLinear()
        .domain([0, 255])
        .range([height, 0]);

      const rects = svg.selectAll("rect").data(slicedData);
      
      rects.enter()
        .append("rect")
        .merge(rects as any)
        .attr("x", (d: any, i: number) => xScale(String(i)) || 0)
        .attr("y", (d: any) => yScale(d))
        .attr("width", xScale.bandwidth())
        .attr("height", (d: any) => height - yScale(d))
        .attr("fill", (d: any) => {
          const intensity = d / 255;
          return `rgb(${Math.round(255 * Math.pow(intensity, 1.5))}, ${Math.round(200 * (1 - intensity))}, 50)`;
        })
        .attr("rx", 1)
        .attr("opacity", 0.9);
        
      rects.exit().remove();
    };

    // Delay start slightly to allow rendering
    setTimeout(() => {
      draw();
    }, 100);

    return () => {
      cancelAnimationFrame(animationFrameId);
      svg.selectAll("*").remove(); 
    };
  }, [masterAnalyserRef]);

  useEffect(() => {
    let animationFrameId: number;
    const dataArrayA = new Uint8Array(64);
    const dataArrayB = new Uint8Array(64);

    const checkClipping = () => {
      // Deck A
      if (analyserRefA?.current) {
        analyserRefA.current.getByteTimeDomainData(dataArrayA);
        let maxAmpA = 0;
        for (let i = 0; i < dataArrayA.length; i++) {
          const val = Math.abs(dataArrayA[i] - 128);
          if (val > maxAmpA) maxAmpA = val;
        }
        if (clipLightRefA.current) {
          if (maxAmpA > 120) { // ~0.94
            clipLightRefA.current.style.backgroundColor = "#ef4444";
            clipLightRefA.current.style.boxShadow = "0 0 12px #ef4444";
          } else {
            clipLightRefA.current.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
            clipLightRefA.current.style.boxShadow = "none";
          }
        }
      }

      // Deck B
      if (analyserRefB?.current) {
        analyserRefB.current.getByteTimeDomainData(dataArrayB);
        let maxAmpB = 0;
        for (let i = 0; i < dataArrayB.length; i++) {
          const val = Math.abs(dataArrayB[i] - 128);
          if (val > maxAmpB) maxAmpB = val;
        }
        if (clipLightRefB.current) {
          if (maxAmpB > 120) { // ~0.94
            clipLightRefB.current.style.backgroundColor = "#ef4444";
            clipLightRefB.current.style.boxShadow = "0 0 12px #ef4444";
          } else {
            clipLightRefB.current.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
            clipLightRefB.current.style.boxShadow = "none";
          }
        }
      }

      animationFrameId = requestAnimationFrame(checkClipping);
    };

    checkClipping();
    return () => cancelAnimationFrame(animationFrameId);
  }, [analyserRefA, analyserRefB]);

  // Custom dial render helper (creates fully styled Pioneer silver-top knobs)
  const renderDial = (
    label: string,
    deckId: "A" | "B",
    param: "eqHigh" | "eqMid" | "eqLow" | "filterVal",
    min: number,
    max: number,
    value: number,
    colorAccent: string,
    compactDial?: boolean
  ) => {
    // Calculate rotation angle matching knob position
    const percentage = (value - min) / (max - min);
    const angle = -135 + percentage * 270; // 270 degree rotation range

    const handleDialMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startValue = value;
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY; // Up is positive
        const sensitivity = (max - min) / 150; // 150px drag for full range
        let newVal = startValue + deltaY * sensitivity;
        newVal = Math.max(min, Math.min(max, newVal));
        onChangeKnob(deckId, param, newVal);
      };
      
      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
      
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };

    const handleDialDoubleClick = () => {
      onChangeKnob(deckId, param, 0); // Reset to 0 (default center)
    };

    return (
      <div className={`flex flex-col items-center group select-none ${compactDial ? "gap-0.5" : "gap-1"}`}>
        <span className="text-[8px] text-zinc-500 font-extrabold tracking-widest uppercase">{label}</span>
        
        {/* Hardware Knob Body wrapper */}
        <div 
          className={`relative bg-[#050505] border border-white/5 rounded-full flex items-center justify-center shadow-lg cursor-ns-resize hover:border-[#333] transition-colors ${
            compactDial ? "w-8 h-8" : "w-11 h-11"
          }`}
          onMouseDown={handleDialMouseDown}
          onDoubleClick={handleDialDoubleClick}
        >
          
          {/* Knob face rotation anchor */}
          <div
            className="w-full h-full relative flex items-center justify-center transition-transform duration-0 pointer-events-none"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            {/* Center tick indicator mark */}
            <div className={`absolute top-0 w-0.5 rounded-full ${colorAccent} ${compactDial ? "h-1.5" : "h-2.5"}`} />
            {/* Silver cap gradient reflection shadow */}
            <div className={`rounded-full bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700 shadow flex items-center justify-center ${
              compactDial ? "w-5 h-5" : "w-8 h-8"
            }`} />
          </div>

          {/* Quick value display overlay on hover */}
          <div className="absolute inset-0 bg-[#050505]/95 rounded-full opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
            <span className="text-[8px] font-mono leading-none font-bold text-gray-400">
              {param === "filterVal" 
                ? (value > 0 ? `HP` : value < 0 ? `LP` : `FL`)
                : `${value > 0 ? "+" : ""}${value.toFixed(0)}`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="dj-hardware-mixer" className={`bg-[#1a1a1a] border border-white/10 rounded-2xl flex flex-col justify-between shadow-2xl ${
      compact ? "p-3 gap-2 h-full min-h-0" : "p-6 gap-6"
    }`}>
      
      {/* Hardware Panel Title */}
      <div className={`flex items-center justify-between border-b border-white/5 ${compact ? "pb-1 cursor-default text-xs" : "pb-3"}`}>
        <div className="flex items-center gap-1.5">
          <Volume2 className="text-orange-500 h-4 w-4 shrink-0" />
          <h2 className={`font-semibold text-gray-200 uppercase tracking-wider ${compact ? "text-xs" : "text-xl"}`}>{compact ? "MIXER" : "MIXER CONSOLE"}</h2>
        </div>
        {!compact && (
          <span className="text-[10px] bg-[#050505] font-mono text-zinc-400 px-2 py-0.5 rounded border border-white/5">
            PRO-DJ EQ ENGINE
          </span>
        )}
      </div>

      {/* 3-Band Equalizer & sweeping filters columns */}
      <div className={`grid grid-cols-2 bg-[#111] rounded-xl border border-white/5 ${
        compact ? "gap-2 p-2" : "gap-8 p-4"
      }`}>
        
        {/* DECK A EQ Column */}
        <div className={`flex flex-col items-center border-r border-white/5 ${
          compact ? "gap-2.5 pr-2" : "gap-5 pr-4"
        }`}>
          <span className="text-[9px] font-bold text-orange-500 tracking-widest uppercase">CHAN A EQ</span>
          <div className={`grid grid-cols-3 w-full justify-items-center ${compact ? "gap-1" : "gap-3"}`}>
            {renderDial("HI", "A", "eqHigh", -12, 12, deckA.eqHigh, "bg-orange-500", compact)}
            {renderDial("MID", "A", "eqMid", -12, 12, deckA.eqMid, "bg-orange-500", compact)}
            {renderDial("LOW", "A", "eqLow", -12, 12, deckA.eqLow, "bg-orange-500", compact)}
          </div>
          {renderDial("FILTER", "A", "filterVal", -100, 100, deckA.filterVal, "bg-orange-500", compact)}
        </div>

        {/* DECK B EQ Column */}
        <div className={`flex flex-col items-center ${
          compact ? "gap-2.5 pl-2" : "gap-5 pl-4"
        }`}>
          <span className="text-[9px] font-bold text-blue-400 tracking-widest uppercase">CHAN B EQ</span>
          <div className={`grid grid-cols-3 w-full justify-items-center ${compact ? "gap-1" : "gap-3"}`}>
            {renderDial("HI", "B", "eqHigh", -12, 12, deckB.eqHigh, "bg-blue-400", compact)}
            {renderDial("MID", "B", "eqMid", -12, 12, deckB.eqMid, "bg-blue-400", compact)}
            {renderDial("LOW", "B", "eqLow", -12, 12, deckB.eqLow, "bg-blue-400", compact)}
          </div>
          {renderDial("FILTER", "B", "filterVal", -100, 100, deckB.filterVal, "bg-blue-400", compact)}
        </div>

      </div>

      {/* FX controls panel & Volume Sliders Section */}
      <div className={`grid grid-cols-3 items-stretch bg-[#050505]/20 border border-white/5 rounded-xl ${
        compact ? "gap-1.5 p-1.5" : "gap-4 p-4"
      }`}>
        
        {/* Channel A volume fader */}
        <div className={`relative flex flex-col items-center justify-between select-none text-center ${compact ? "gap-1" : "gap-2.5"}`}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] text-orange-500 font-bold uppercase tracking-widest">FAD A</span>
            <div 
              ref={clipLightRefA} 
              className="w-2.5 h-1.5 rounded-sm border border-white/10 transition-colors duration-75"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
              title="Clip Indicator"
            />
          </div>
          <div className={`relative flex items-center justify-center ${compact ? "h-14 w-4" : "h-28 w-4"}`}>
            <input
              id="volume-fader-a"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckA.volume}
              onChange={(e) => onChangeKnob("A", "volume", parseFloat(e.target.value))}
              className="w-1.5 h-full bg-[#050505] rounded-full appearance-none outline-none cursor-ns-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
              style={{ WebkitAppearance: "slider-vertical" } as any}
              {...{ orient: "vertical" }}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-500">{(deckA.volume * 100).toFixed(0)}%</span>
        </div>

        {/* MASTER FX SECTION */}
        <div className={`flex flex-col justify-center border-x border-[#222]/40 px-2 bg-[#050505]/40 rounded-xl ${
          compact ? "space-y-1.5 py-1" : "space-y-4 py-1"
        }`}>
          <span className="text-[10px] text-zinc-400 font-black tracking-widest uppercase text-center flex items-center justify-center gap-1">
            <Waves className="h-3 w-3 text-orange-500 animate-pulse shrink-0" /> {compact ? "FX" : "FX LOOP"}
          </span>

          {/* Reverb controls */}
          <div className="space-y-0.5">
            <div className="flex justify-between items-center text-[9px] font-bold text-zinc-500 font-mono">
              <span>{compact ? "REV" : "REVERB"}</span>
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
              className="fader-range w-full h-1 bg-[#050505] rounded-full appearance-none cursor-ew-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
            />
          </div>

          {/* Delay controls */}
          <div className="space-y-0.5">
            <div className="flex justify-between items-center text-[9px] font-bold text-zinc-500 font-mono">
              <span>{compact ? "DLY" : "DELAY"}</span>
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
              className="fader-range w-full h-1 bg-[#050505] rounded-full appearance-none cursor-ew-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
            />
          </div>

          {/* Delay Time Interval select */}
          <div className="space-y-0.5">
            {!compact && (
              <div className="flex justify-between items-center text-[10px] font-semibold text-zinc-550 font-mono">
                <span>ECHO SPEED</span>
                <span>{(fxDelayTime).toFixed(2)}s</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-0.5">
              {[0.25, 0.5, 0.75].map((timeVal) => (
                <button
                  id={`fx-delay-time-btn-${timeVal}`}
                  key={timeVal}
                  onClick={() => onChangeKnob("Master", "fxDelayTime", timeVal)}
                  className={`py-0.5 text-[8.5px] font-bold rounded-md font-mono border ${
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
        <div className={`relative flex flex-col items-center justify-between select-none text-center ${compact ? "gap-1" : "gap-2.5"}`}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">FAD B</span>
            <div 
              ref={clipLightRefB} 
              className="w-2.5 h-1.5 rounded-sm border border-white/10 transition-colors duration-75"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
              title="Clip Indicator"
            />
          </div>
          <div className={`relative flex items-center justify-center ${compact ? "h-14 w-4" : "h-28 w-4"}`}>
            <input
              id="volume-fader-b"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckB.volume}
              onChange={(e) => onChangeKnob("B", "volume", parseFloat(e.target.value))}
              className="w-1.5 h-full bg-[#050505] rounded-full appearance-none outline-none cursor-ns-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
              style={{ WebkitAppearance: "slider-vertical" } as any}
              {...{ orient: "vertical" }}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-500">{(deckB.volume * 100).toFixed(0)}%</span>
        </div>

      </div>

      {/* Crossfader Slide Control Row */}
      <div className={`bg-[#050505]/40 rounded-xl border border-white/5 relative ${
        compact ? "p-1.5 space-y-1" : "p-4 space-y-3"
      }`}>
        <div className={`flex justify-between items-center select-none text-[10px] ${compact ? "text-[8.5px]" : ""}`}>
          <span className="text-zinc-555 font-bold uppercase tracking-widest flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3 text-orange-500" /> {compact ? "DECK A" : "DECK A (LEFT)"}
          </span>
          
          <button
            onClick={onToggleCrossfaderCurve}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${
              crossfaderCurve === "cut" 
                ? "bg-red-500/10 border-red-500/20 text-red-500" 
                : crossfaderCurve === "linear" 
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                  : "bg-orange-500/10 border-orange-500/20 text-orange-500"
            } transition-colors cursor-pointer title="Crossfader Curve"`}
          >
            <span className="font-mono font-bold text-[8px] uppercase">CURVE: {crossfaderCurve}</span>
          </button>
          
          <span className="text-zinc-555 font-bold uppercase tracking-widest flex items-center gap-1">
            {compact ? "DECK B" : "DECK B (RIGHT)"} <SlidersHorizontal className="h-3 w-3 text-blue-450" />
          </span>
        </div>

        <div className="relative flex items-center w-full min-h-4">
          <input
            id="crossfader-fader"
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={crossfader}
            onChange={(e) => onChangeKnob("Master", "crossfader", parseFloat(e.target.value))}
            className="fader-range w-full h-1 bg-[#050505] rounded-full appearance-none cursor-ew-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
          />
          {/* Centering zero-detent line mark */}
          <div className="absolute left-1/2 -ml-0.5 w-1 h-3 bg-[#111] rounded pointer-events-none" />
        </div>
      </div>

      {/* Master Volume Output & Hard Limiter Section */}
      <div className={`${compact ? "space-y-1" : "space-y-2"}`}>
        {/* D3 Real-Time Frequency Visualizer */}
        <div className="w-full px-1">
          <svg 
            ref={svgRef} 
            className={`w-full ${compact ? "h-6" : "h-12"} rounded-md bg-[#020202] border border-white/5 shadow-inner`}
          />
        </div>

        {/* Master Volume Output Control Row */}
        <div className={`flex justify-between items-center gap-4 border border-white/5 ${
          compact ? "bg-[#050505]/40 p-1.5 rounded-lg" : "bg-[#050505]/80 p-3.5 rounded-xl"
        }`}>
          <div className="flex items-center gap-1.5 select-none shrink-0">
            <Sliders className="h-4 w-4 text-orange-500" />
            <span className={`font-bold tracking-widest uppercase text-[#aaa] ${compact ? "text-[8.5px]" : "text-[10px]"}`}>{compact ? "OUT" : "MASTER OUT"}</span>
          </div>
          
          <input
            id="master-volume-slider"
            type="range"
            min="0"
            max="1.2"
            step="0.01"
            value={masterVolume}
            onChange={(e) => onChangeKnob("Master", "masterVolume", parseFloat(e.target.value))}
            className="fader-range flex-1 h-1 bg-[#050505] rounded-full appearance-none cursor-ew-resize shadow-[inset_0_1px_3px_rgba(0,0,0,1)]"
          />

          <span className={`font-mono text-zinc-400 font-bold ${compact ? "text-[10px]" : "text-[10px] w-12 text-right"}`}>
            {(masterVolume * 100).toFixed(0)}%
          </span>
        </div>

        {/* Optional Hard Limiter Toggle Switch */}
        <div className={`flex justify-between items-center border border-white/5 ${
          compact ? "bg-[#050505]/20 p-1.5 rounded-lg gap-2" : "bg-[#050505]/50 p-2.5 rounded-xl gap-4"
        }`}>
          <div className="flex items-center gap-1.5 select-none shrink-0">
            <ShieldCheck className={`h-4 w-4 ${limiterEnabled ? "text-emerald-500 animate-pulse" : "text-zinc-500"}`} />
            <div className="text-left font-sans">
              <p className={`font-bold tracking-widest uppercase text-zinc-300 ${compact ? "text-[8px]" : "text-[9px]"}`}>HARD LIMITER</p>
              {!compact && <p className="text-[7.5px] text-zinc-500 leading-none mt-0.5">PREVENT DISTORTION/CLIPPING</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`font-mono font-bold text-[8.5px] uppercase ${limiterEnabled ? "text-emerald-400" : "text-zinc-500"}`}>
              {limiterEnabled ? "ACTIVE (-1dB)" : "BYPASS"}
            </span>
            <button
              id="limiter-toggle-btn"
              onClick={onToggleLimiter}
              className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-zinc-700 transition-colors duration-200 ease-in-out focus:outline-none ${
                limiterEnabled ? "bg-emerald-500" : "bg-zinc-850"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  limiterEnabled ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Master EQ Bypass Switch */}
        <div className={`flex justify-between items-center border border-white/5 ${
          compact ? "bg-[#050505]/20 p-1.5 rounded-lg gap-2" : "bg-[#050505]/50 p-2.5 rounded-xl gap-4"
        }`}>
          <div className="flex items-center gap-1.5 select-none shrink-0">
            <SlidersHorizontal className={`h-4 w-4 ${eqBypass ? "text-orange-500 animate-pulse" : "text-zinc-500"}`} />
            <div className="text-left font-sans">
              <p className={`font-bold tracking-widest uppercase text-zinc-300 ${compact ? "text-[8px]" : "text-[9px]"}`}>EQ BYPASS</p>
              {!compact && <p className="text-[7.5px] text-zinc-500 leading-none mt-0.5">ROUTE AROUND HARDWARE EQ</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`font-mono font-bold text-[8.5px] uppercase ${eqBypass ? "text-orange-400" : "text-zinc-500"}`}>
              {eqBypass ? "BYPASSED" : "ACTIVE"}
            </span>
            <button
              id="eq-bypass-toggle-btn"
              onClick={onToggleEqBypass}
              className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-zinc-700 transition-colors duration-200 ease-in-out focus:outline-none ${
                eqBypass ? "bg-orange-500" : "bg-zinc-850"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  eqBypass ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
