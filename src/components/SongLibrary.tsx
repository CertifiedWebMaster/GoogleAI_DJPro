/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Track } from "../types";
import { PRELOADED_TRACKS } from "../data";
import { Music, Upload, CloudLightning, Search, Loader2, Play, CircleAlert } from "lucide-react";

interface SongLibraryProps {
  onLoadTrack: (track: Track, deckId: "A" | "B") => void;
  deckTrackA: Track | null;
  deckTrackB: Track | null;
}

export default function SongLibrary({ onLoadTrack, deckTrackA, deckTrackB }: SongLibraryProps) {
  const [tracks, setTracks] = useState<Track[]>(PRELOADED_TRACKS);
  const [searchQuery, setSearchQuery] = useState("");
  const [scUrl, setScUrl] = useState("");
  const [scLoading, setScLoading] = useState(false);
  const [scError, setScError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter track library
  const filteredTracks = tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.genre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle local file uploads (Bypasses CORS completely - perfect for full mixing)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newTracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const objectUrl = URL.createObjectURL(file);
      
      // Attempt to guess metadata from naming conventional "Artist - Song Title.mp3"
      let title = file.name.replace(/\.[^/.]+$/, ""); // strip extension
      let artist = "Local File";
      const dashIndex = title.indexOf("-");
      if (dashIndex > -1) {
        artist = title.substring(0, dashIndex).trim();
        title = title.substring(dashIndex + 1).trim();
      }

      newTracks.push({
        id: `local-${Date.now()}-${i}`,
        title,
        artist,
        duration: "Upload", // Computed on browser element load
        bpm: 120, // Default baseline for mapping
        url: objectUrl,
        genre: "My Tracks (Offline Safe)",
        isUserUploaded: true,
        coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=80&fit=crop"
      });
    }

    setTracks((prev) => [...newTracks, ...prev]);
  };

  // Handle SoundCloud URL Resolution
  const handleSoundCloudResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scUrl) return;

    setScLoading(true);
    setScError("");

    try {
      const response = await fetch(`/api/soundcloud-resolve?url=${encodeURIComponent(scUrl)}`);
      if (!response.ok) {
        throw new Error("Could not resolve this SoundCloud song. Make sure the URL is public.");
      }

      const data = await response.json();
      
      // Inject SoundCloud Track into our local mixing library catalog!
      const resolvedTrack: Track = {
        id: `soundcloud-${Date.now()}`,
        title: data.title || "SoundCloud Track",
        artist: data.artist || "SoundCloud Artist",
        duration: "Stream",
        bpm: 124, // Baseline
        url: scUrl, // Stores original soundcloud url
        genre: "SoundCloud Integration",
        coverUrl: data.thumbnail || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80&fit=crop",
      };

      setTracks((prev) => [resolvedTrack, ...prev]);
      setScUrl("");
    } catch (err: any) {
      setScError(err.message || "Failed resolving SoundCloud link");
    } finally {
      setScLoading(false);
    }
  };

  return (
    <div id="dj-track-library" className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 flex flex-col h-[520px]">
      
      {/* Title & Import Filer */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-200 flex items-center gap-2">
            <Music className="text-orange-500 h-5 w-5" />
            Track Library
          </h2>
          <span className="text-xs text-zinc-400">Preloaded mixes, offline local files, and SoundCloud tracks</span>
        </div>

        {/* Quick Search */}
        <div className="relative w-full md:w-64">
          <input
            id="library-search-input"
            type="text"
            placeholder="Search tracks or genres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#050505] text-gray-200 pl-9 pr-4 py-2 rounded-xl text-sm border border-white/5 focus:border-white/20 focus:outline-none"
          />
          <Search className="absolute left-3 top-2.5 text-zinc-500 h-4 w-4" />
        </div>
      </div>

      {/* Upload and SoundCloud Connection Rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Drag and Drop / Manual Upload */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-white/5 hover:border-orange-500/50 bg-[#050505]/40 hover:bg-[#050505]/80 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group"
        >
          <input
            id="file-upload-input"
            type="file"
            ref={fileInputRef}
            multiple
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Upload className="h-6 w-6 text-zinc-400 group-hover:text-orange-550 mb-2 transition-transform group-hover:-translate-y-0.5" />
          <p className="text-sm font-medium text-gray-300">Import Local MP3s</p>
          <span className="text-xs text-zinc-500">Bypasses CORS restrictions (pure live mixing)</span>
        </div>

        {/* SoundCloud Connector */}
        <div className="border border-white/10 bg-[#050505]/40 rounded-xl p-4">
          <form onSubmit={handleSoundCloudResolve} className="space-y-2">
            <div className="flex items-center gap-2 text-zinc-300">
              <CloudLightning className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Link SoundCloud Track</span>
            </div>
            
            <div className="flex gap-2">
              <input
                id="soundcloud-link-input"
                type="url"
                placeholder="Paste SoundCloud URL..."
                value={scUrl}
                onChange={(e) => setScUrl(e.target.value)}
                className="flex-1 bg-[#050505]/80 text-gray-200 px-3 py-1.5 rounded-lg text-xs border border-white/5 focus:outline-none focus:border-orange-500"
              />
              <button
                id="soundcloud-load-btn"
                type="submit"
                disabled={scLoading}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 text-white font-medium px-3 rounded-lg text-xs transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {scLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Load"}
              </button>
            </div>
            {scError && (
              <p className="text-[10px] text-red-400 flex items-center gap-1">
                <CircleAlert className="h-2.5 w-2.5" />
                {scError}
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Playlist Grid Scroll */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
        {filteredTracks.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-zinc-500 border border-white/5 rounded-xl bg-[#050505]/20">
            <span className="text-xs">No tracks found. Upload local files to mix!</span>
          </div>
        ) : (
          filteredTracks.map((track) => {
            const isLoadedA = deckTrackA?.id === track.id;
            const isLoadedB = deckTrackB?.id === track.id;

            return (
              <div
                id={`track-item-${track.id}`}
                key={track.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                  isLoadedA 
                    ? "bg-orange-950/20 border-orange-500/20" 
                    : isLoadedB 
                    ? "bg-blue-950/20 border-blue-500/20" 
                    : "bg-[#050505]/40 border-white/5 hover:border-white/10"
                }`}
              >
                {/* Track Cover + Title */}
                <div className="flex items-center gap-3">
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-lg object-cover bg-[#111] shadow"
                  />
                  <div>
                    <h4 className="text-sm font-medium text-gray-200 line-clamp-1">{track.title}</h4>
                    <p className="text-xs text-zinc-500 line-clamp-1 flex items-center gap-1.5">
                      {track.artist}
                      <span className="text-[#333]">•</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 bg-[#111] border border-white/5 px-1 py-0.5 rounded">
                        {track.genre}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Integration Info + Controls */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right flex flex-col justify-center">
                    <span className="text-xs font-mono font-medium text-zinc-400">{track.bpm} BPM</span>
                    <span className="text-[10px] text-zinc-650 uppercase tracking-widest">{track.duration}</span>
                  </div>

                  {/* Load Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      id={`load-deck-a-btn-${track.id}`}
                      onClick={() => onLoadTrack(track, "A")}
                      className={`px-2.5 py-1 flex items-center gap-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                        isLoadedA
                          ? "bg-orange-500 text-slate-950 font-bold"
                          : "bg-[#222] hover:bg-orange-500/20 text-orange-400 border border-orange-500/15"
                      }`}
                    >
                      A
                    </button>
                    <button
                      id={`load-deck-b-btn-${track.id}`}
                      onClick={() => onLoadTrack(track, "B")}
                      className={`px-2.5 py-1 flex items-center gap-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                        isLoadedB
                          ? "bg-blue-500 text-slate-950 font-bold"
                          : "bg-[#222] hover:bg-blue-500/20 text-blue-400 border border-blue-500/15"
                      }`}
                    >
                      B
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
