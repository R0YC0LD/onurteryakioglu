import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg0: "#000000",
  bg1: "#0A0A0A",
  bg2: "#111111",
  bg3: "#181818",
  bg4: "#1E1E1E",
  bg5: "#242424",
  border: "#282828",
  border2: "#333333",
  muted: "#4A4A4A",
  secondary: "#888888",
  primary: "#C8C8C8",
  white: "#FFFFFF",
  accent: "#2D74FF",
  accentDim: "#1A4799",
  accentMuted: "rgba(45,116,255,0.15)",
  red: "#E05252",
  green: "#4CAF50",
  amber: "#E8A020",
};

// ─── EQ Data ──────────────────────────────────────────────────────────────────
const EQ_BANDS = [
  { freq: "32Hz", label: "32" },
  { freq: "64Hz", label: "64" },
  { freq: "125Hz", label: "125" },
  { freq: "250Hz", label: "250" },
  { freq: "500Hz", label: "500" },
  { freq: "1kHz", label: "1k" },
  { freq: "2kHz", label: "2k" },
  { freq: "4kHz", label: "4k" },
  { freq: "8kHz", label: "8k" },
  { freq: "16kHz", label: "16k" },
];

const EQ_PRESETS = {
  flat: { name: "Flat", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 },
  studio: { name: "Studio Reference", bands: [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5, 0.5, 1], preamp: -1 },
  bass: { name: "Bass Boost", bands: [6, 5, 4, 2, 1, 0, 0, 0, 0, 0], preamp: -2 },
  vocal: { name: "Vocal Detail", bands: [-2, -2, -1, 0, 2, 3, 4, 3, 2, 1], preamp: -1 },
  acoustic: { name: "Acoustic", bands: [3, 2, 1, 0, 0, 1, 2, 3, 3, 2], preamp: 0 },
  late: { name: "Late Night", bands: [2, 1, 0, -1, -2, -3, -2, -1, 0, 1], preamp: -3 },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_TRACKS = [
  { id: "1", title: "Gece Yürüyüşü", artist: "R0YC0LD", album: "Günlük", duration: "3:42", explicit: true, plays: "124K", cover: "1" },
  { id: "2", title: "Beton ve Sis", artist: "R0YC0LD", album: "Günlük", duration: "4:18", explicit: false, plays: "89K", cover: "2" },
  { id: "3", title: "Sabah Sisi", artist: "R0YC0LD", album: "Günlük", duration: "2:57", explicit: true, plays: "215K", cover: "3" },
  { id: "4", title: "Şehrin Nabzı", artist: "R0YC0LD", album: "Günlük", duration: "5:01", explicit: false, plays: "67K", cover: "4" },
  { id: "5", title: "Karanlıkta Ritim", artist: "R0YC0LD", album: "Günlük", duration: "3:55", explicit: true, plays: "312K", cover: "5" },
  { id: "6", title: "Kayıp Sinyaller", artist: "R0YC0LD", album: "Günlük", duration: "4:29", explicit: false, plays: "178K", cover: "6" },
  { id: "7", title: "Duman", artist: "R0YC0LD", album: "Günlük", duration: "3:11", explicit: true, plays: "445K", cover: "7" },
  { id: "8", title: "Son Durak", artist: "R0YC0LD", album: "Günlük", duration: "6:02", explicit: false, plays: "93K", cover: "8" },
];

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #2d1b1b 0%, #3d2020 50%, #1a0a0a 100%)",
  "linear-gradient(135deg, #1b2d1b 0%, #203d20 50%, #0a1a0a 100%)",
  "linear-gradient(135deg, #2d2d1b 0%, #3d3d20 50%, #1a1a0a 100%)",
  "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #0a0a0a 100%)",
  "linear-gradient(135deg, #1b1b2d 0%, #20203d 50%, #0a0a1a 100%)",
  "linear-gradient(135deg, #2d1b2d 0%, #3d203d 50%, #1a0a1a 100%)",
  "linear-gradient(135deg, #1a2d2d 0%, #203d3d 50%, #0a1a1a 100%)",
];

// ─── Utility Components ────────────────────────────────────────────────────────
const CoverArt = ({ index, size = 48, style = {} }) => (
  <div style={{
    width: size, height: size, borderRadius: 4, flexShrink: 0,
    background: COVER_GRADIENTS[(parseInt(index) - 1) % COVER_GRADIENTS.length],
    display: "flex", alignItems: "center", justifyContent: "center",
    ...style
  }}>
    <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" fill="rgba(255,255,255,0.2)" />
      <circle cx="12" cy="12" r="8" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="11" stroke="rgba(255,255,255,0.06)" strokeWidth="1" fill="none" />
    </svg>
  </div>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 16, color = T.secondary }) => {
  const paths = {
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    skip_next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
    skip_prev: "M6 6h2v12H6zm3.5 6 8.5 6V6z",
    shuffle: "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
    repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
    repeat_one: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z",
    volume: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z",
    volume_mute: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z",
    heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    heart_outline: "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
    queue: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z",
    eq: "M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z",
    settings: "M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z",
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    chevron_right: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    library: "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z",
    home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
    search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
    analytics: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d={paths[name] || paths.info} />
    </svg>
  );
};

// ─── Spectrum Visualizer ──────────────────────────────────────────────────────
const SpectrumBar = ({ height, index }) => {
  const hue = 200 + index * 3;
  return (
    <div style={{
      width: "100%", height: `${Math.max(2, height)}%`,
      background: height > 60 ? T.accent : height > 35 ? "#1a5bcc" : "#12307a",
      borderRadius: "1px 1px 0 0",
      transition: "height 50ms linear",
    }} />
  );
};

// ─── EQ Slider ────────────────────────────────────────────────────────────────
const EQSlider = ({ value, onChange, label, freq }) => {
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef(null);

  const getValueFromEvent = useCallback((clientY) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = 1 - (clientY - rect.top) / rect.height;
    return Math.round(Math.max(-12, Math.min(12, pct * 24 - 12)) * 10) / 10;
  }, [value]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setDragging(true);
    onChange(getValueFromEvent(e.clientY));
    const move = (me) => onChange(getValueFromEvent(me.clientY));
    const up = () => { setDragging(false); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const pct = ((value + 12) / 24) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 }}>
      <span style={{ fontFamily: "JetBrains Mono, Roboto Mono, monospace", fontSize: 9, color: value === 0 ? T.muted : value > 0 ? T.accent : T.red, letterSpacing: "0.04em" }}>
        {value > 0 ? "+" : ""}{value.toFixed(1)}
      </span>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        role="slider"
        aria-label={`${freq} EQ band`}
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onChange(Math.min(12, value + 0.5));
          if (e.key === "ArrowDown") onChange(Math.max(-12, value - 0.5));
        }}
        style={{
          width: 20, height: 140, background: T.bg4, borderRadius: 10,
          position: "relative", cursor: "ns-resize", flexShrink: 0,
          border: `1px solid ${T.border}`,
        }}
      >
        {/* Center line */}
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: T.border2 }} />
        {/* Track fill */}
        <div style={{
          position: "absolute",
          bottom: value >= 0 ? "50%" : `${pct}%`,
          left: 3, right: 3,
          height: `${Math.abs(value) / 24 * 100}%`,
          background: value >= 0 ? T.accent : T.red,
          borderRadius: 3,
          opacity: 0.7,
        }} />
        {/* Thumb */}
        <div style={{
          position: "absolute",
          bottom: `calc(${pct}% - 8px)`,
          left: "50%", transform: "translateX(-50%)",
          width: 16, height: 16, borderRadius: "50%",
          background: dragging ? T.accent : "#3A3A3A",
          border: `2px solid ${dragging ? T.accent : T.border2}`,
          transition: dragging ? "none" : "background 0.1s, border-color 0.1s",
        }} />
      </div>
      <span style={{ fontFamily: "JetBrains Mono, Roboto Mono, monospace", fontSize: 9, color: T.muted, letterSpacing: "0.02em" }}>
        {label}
      </span>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function R0YCL0UD() {
  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(MOCK_TRACKS[0]);
  const [position, setPosition] = useState(0); // 0–1
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [repeat, setRepeat] = useState("off"); // off | track | queue
  const [shuffle, setShuffle] = useState(false);
  const [liked, setLiked] = useState(new Set(["3", "5", "7"]));

  // UI state
  const [activeView, setActiveView] = useState("library");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("audio");
  const [showQueue, setShowQueue] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [uploadStep, setUploadStep] = useState(0);

  // EQ state
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqBands, setEqBands] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [preamp, setPreamp] = useState(0);
  const [activePreset, setActivePreset] = useState("flat");

  // Audio quality
  const [streamQuality, setStreamQuality] = useState("high");
  const [normalizeVolume, setNormalizeVolume] = useState(true);
  const [crossfade, setCrossfade] = useState(0);
  const [gapless, setGapless] = useState(true);
  const [cacheSize, setCacheSize] = useState(10);

  // Spectrum visualizer (simulated)
  const [spectrumData, setSpectrumData] = useState(Array(24).fill(0));
  const animRef = useRef(null);
  const phaseRef = useRef(0);

  // Progress bar dragging
  const [draggingProgress, setDraggingProgress] = useState(false);
  const progressRef = useRef(null);

  // Simulate spectrum + playback progress
  useEffect(() => {
    const tick = () => {
      phaseRef.current += 0.04;
      if (isPlaying) {
        setPosition(p => {
          const next = p + 0.0004;
          return next >= 1 ? 0 : next;
        });
        setSpectrumData(Array.from({ length: 24 }, (_, i) => {
          const base = Math.sin(phaseRef.current * 0.7 + i * 0.5) * 30 + 40;
          const noise = Math.random() * 20;
          const lowBump = i < 4 ? 25 : 0;
          return Math.max(0, Math.min(100, base + noise + lowBump));
        }));
      } else {
        setSpectrumData(d => d.map(v => Math.max(0, v - 3)));
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  const formatTime = (pct, totalMs = 222000) => {
    const ms = pct * totalMs;
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const applyPreset = (id) => {
    setActivePreset(id);
    const p = EQ_PRESETS[id];
    if (p) { setEqBands([...p.bands]); setPreamp(p.preamp); }
  };

  const setBand = (i, v) => {
    setEqBands(b => { const n = [...b]; n[i] = v; return n; });
    setActivePreset("custom");
  };

  const skipTrack = (dir) => {
    const idx = MOCK_TRACKS.findIndex(t => t.id === currentTrack.id);
    const next = dir > 0
      ? MOCK_TRACKS[(idx + 1) % MOCK_TRACKS.length]
      : MOCK_TRACKS[(idx - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length];
    setCurrentTrack(next);
    setPosition(0);
  };

  const handleProgressClick = (e) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    setPosition(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  // ─── Studio Upload Steps ─────────────────────────────────────────────────
  const [albumMeta, setAlbumMeta] = useState({ title: "Günlük", date: "2025-09-01", genre: "Slow Rap / Concept", copyright: "© 2025 R0YC0LD" });
  const [uploadedTracks, setUploadedTracks] = useState(MOCK_TRACKS.slice(0, 4).map(t => ({ ...t, isrc: `TRX2025${t.id.padStart(6, '0')}`, explicit: t.explicit })));

  const SETTINGS_TABS = [
    { id: "account", label: "Account", icon: "user" },
    { id: "audio", label: "Audio Quality", icon: "volume" },
    { id: "playback", label: "Playback & DSP", icon: "eq" },
    { id: "devices", label: "Devices", icon: "settings" },
    { id: "shortcuts", label: "Shortcuts", icon: "library" },
  ];

  const NAV_ITEMS = [
    { id: "library", label: "Library", icon: "home" },
    { id: "search", label: "Search", icon: "search" },
    { id: "analytics", label: "Analytics", icon: "analytics" },
  ];

  const KEYBOARD_SHORTCUTS = [
    { key: "Space", action: "Play / Pause" },
    { key: "J", action: "Seek backward 10s" },
    { key: "K", action: "Play / Pause" },
    { key: "L", action: "Seek forward 10s" },
    { key: "M", action: "Mute / Unmute" },
    { key: "Shift + ↑", action: "Volume Up" },
    { key: "Shift + ↓", action: "Volume Down" },
    { key: "N", action: "Next Track" },
    { key: "P", action: "Previous Track" },
    { key: "S", action: "Toggle Shuffle" },
    { key: "R", action: "Cycle Repeat Mode" },
    { key: ",", action: "Open Settings" },
  ];

  const analyticsData = useMemo(() => ({
    streams: Array.from({ length: 28 }, (_, i) => ({
      day: i + 1, count: Math.floor(800 + Math.sin(i * 0.4) * 300 + Math.random() * 200)
    })),
    topTracks: MOCK_TRACKS.map(t => ({ ...t, pct: Math.floor(Math.random() * 80 + 20) })).sort((a,b) => b.pct - a.pct),
    countries: [
      { code: "TR", name: "Turkey", pct: 62 },
      { code: "DE", name: "Germany", pct: 14 },
      { code: "US", name: "United States", pct: 11 },
      { code: "NL", name: "Netherlands", pct: 7 },
      { code: "FR", name: "France", pct: 6 },
    ],
  }), []);

  const maxStreams = Math.max(...analyticsData.streams.map(d => d.count));

  // ─── Styles ────────────────────────────────────────────────────────────────
  const s = {
    app: {
      display: "flex", flexDirection: "column", height: "100vh", width: "100%",
      background: T.bg0, color: T.white,
      fontFamily: "'Inter', 'SF Pro Display', 'Helvetica Neue', sans-serif",
      overflow: "hidden", userSelect: "none",
    },
    topArea: { display: "flex", flex: 1, overflow: "hidden" },
    sidebar: {
      width: 220, flexShrink: 0,
      background: T.bg0,
      borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column",
    },
    main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
    playerBar: {
      height: 88, flexShrink: 0,
      background: T.bg1,
      borderTop: `1px solid ${T.border}`,
      display: "grid", gridTemplateColumns: "1fr 2fr 1fr",
      alignItems: "center", padding: "0 24px", gap: 16,
    },
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.app} role="application" aria-label="R0YCL0UD Music Player">
      <div style={s.topArea}>
        {/* ── Sidebar ── */}
        <nav style={s.sidebar} aria-label="Main navigation">
          {/* Logo */}
          <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 4,
                background: T.accent, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="white">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: T.white }}>R0YCL0UD</div>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.08em", fontFamily: "JetBrains Mono, monospace" }}>v2.0 · LOSSLESS</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <div style={{ padding: "16px 0", flex: 1, display: "flex", flexDirection: "column" }}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveView(item.id); setShowStudio(false); }}
                aria-label={item.label}
                aria-current={activeView === item.id && !showStudio ? "page" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 20px", background: "none", border: "none",
                  cursor: "pointer", width: "100%", textAlign: "left",
                  color: activeView === item.id && !showStudio ? T.white : T.secondary,
                  fontSize: 13, fontWeight: activeView === item.id && !showStudio ? 600 : 400,
                  borderLeft: `2px solid ${activeView === item.id && !showStudio ? T.accent : "transparent"}`,
                  transition: "color 0.1s, border-color 0.1s",
                }}
              >
                <Icon name={item.icon} size={16} color={activeView === item.id && !showStudio ? T.white : T.secondary} />
                {item.label}
              </button>
            ))}

            <div style={{ height: 1, background: T.border, margin: "12px 20px" }} />

            {/* Studio */}
            <button
              onClick={() => setShowStudio(true)}
              aria-label="Open R0YCL0UD Studio"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 20px", background: "none", border: "none",
                cursor: "pointer", width: "100%", textAlign: "left",
                color: showStudio ? T.white : T.secondary,
                fontSize: 13, fontWeight: showStudio ? 600 : 400,
                borderLeft: `2px solid ${showStudio ? T.accent : "transparent"}`,
              }}
            >
              <Icon name="upload" size={16} color={showStudio ? T.white : T.secondary} />
              Studio
            </button>

            {/* Playlists */}
            <div style={{ padding: "12px 20px 4px", fontSize: 10, color: T.muted, letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase" }}>
              Playlists
            </div>
            {["Günlük — Full Album", "Late Sessions", "Road Mix", "Focus Deep Work"].map((pl, i) => (
              <button key={i} style={{
                padding: "7px 20px", background: "none", border: "none",
                cursor: "pointer", width: "100%", textAlign: "left",
                color: T.secondary, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {pl}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Open Settings"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px", background: "none", border: "none",
                cursor: "pointer", width: "100%", textAlign: "left",
                color: T.secondary, fontSize: 13,
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <Icon name="settings" size={16} color={T.secondary} />
              Settings
            </button>
          </div>
        </nav>

        {/* ── Main Content ── */}
        <main style={s.main}>
          {showStudio ? (
            /* ── Studio View ── */
            <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>R0YCL0UD Studio</div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: T.white, margin: 0 }}>Artist Hub</h1>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Upload Release", "Analytics", "Distribution"].map((tab, i) => (
                    <button key={i} onClick={() => setUploadStep(i === 0 ? 0 : -1)} style={{
                      padding: "8px 16px", borderRadius: 4,
                      background: i === 0 && uploadStep >= 0 ? T.accent : T.bg4,
                      border: `1px solid ${i === 0 && uploadStep >= 0 ? T.accent : T.border}`,
                      color: i === 0 && uploadStep >= 0 ? T.white : T.secondary,
                      fontSize: 12, fontWeight: 500, cursor: "pointer",
                    }}>{tab}</button>
                  ))}
                </div>
              </div>

              {uploadStep >= 0 ? (
                /* Upload Wizard */
                <div>
                  {/* Steps indicator */}
                  <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
                    {["Metadata", "Cover Art", "Tracklist", "Credits"].map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: i < uploadStep ? T.accent : i === uploadStep ? "transparent" : T.bg4,
                            border: `2px solid ${i <= uploadStep ? T.accent : T.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 600, color: i < uploadStep ? T.white : i === uploadStep ? T.accent : T.muted,
                          }}>
                            {i < uploadStep ? <Icon name="check" size={14} color={T.white} /> : i + 1}
                          </div>
                          <span style={{ fontSize: 10, color: i === uploadStep ? T.white : T.muted, letterSpacing: "0.06em" }}>{step}</span>
                        </div>
                        {i < 3 && <div style={{ height: 1, background: i < uploadStep ? T.accent : T.border, flex: 0.5, marginBottom: 20 }} />}
                      </div>
                    ))}
                  </div>

                  {/* Step content */}
                  <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 32 }}>
                    {uploadStep === 0 && (
                      <div>
                        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: T.white }}>Album Metadata</h2>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {[
                            { label: "Album Title", key: "title", value: albumMeta.title },
                            { label: "Release Date", key: "date", value: albumMeta.date },
                            { label: "Primary Genre", key: "genre", value: albumMeta.genre },
                            { label: "Copyright", key: "copyright", value: albumMeta.copyright },
                          ].map(field => (
                            <div key={field.key}>
                              <label style={{ display: "block", fontSize: 11, color: T.secondary, marginBottom: 6, letterSpacing: "0.06em" }}>
                                {field.label.toUpperCase()}
                              </label>
                              <input
                                value={field.value}
                                onChange={e => setAlbumMeta(m => ({ ...m, [field.key]: e.target.value }))}
                                style={{
                                  width: "100%", padding: "10px 12px",
                                  background: T.bg4, border: `1px solid ${T.border}`,
                                  borderRadius: 4, color: T.white, fontSize: 13,
                                  outline: "none", boxSizing: "border-box",
                                  fontFamily: "inherit",
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ display: "block", fontSize: 11, color: T.secondary, marginBottom: 6, letterSpacing: "0.06em" }}>ALBUM TYPE</label>
                          <div style={{ display: "flex", gap: 8 }}>
                            {["Single", "EP", "Album"].map(type => (
                              <button key={type} style={{
                                padding: "8px 20px", borderRadius: 4,
                                background: type === "Album" ? T.accent : T.bg4,
                                border: `1px solid ${type === "Album" ? T.accent : T.border}`,
                                color: type === "Album" ? T.white : T.secondary,
                                fontSize: 12, cursor: "pointer",
                              }}>{type}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {uploadStep === 1 && (
                      <div>
                        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: T.white }}>Cover Art</h2>
                        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                          <CoverArt index="1" size={200} style={{ borderRadius: 8, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{
                              border: `2px dashed ${T.border2}`, borderRadius: 8, padding: 40,
                              textAlign: "center", cursor: "pointer",
                              background: T.bg4,
                            }}>
                              <Icon name="upload" size={32} color={T.muted} />
                              <div style={{ marginTop: 12, fontSize: 13, color: T.secondary }}>Drop high-res image here</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: T.muted }}>Minimum 3000 × 3000px · JPG or PNG</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: T.muted }}>Auto-cropped to 1:1 square · Compressed to WebP</div>
                              <button style={{
                                marginTop: 16, padding: "8px 20px", borderRadius: 4,
                                background: T.bg3, border: `1px solid ${T.border2}`,
                                color: T.primary, fontSize: 12, cursor: "pointer",
                              }}>Browse Files</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {uploadStep === 2 && (
                      <div>
                        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: T.white }}>Tracklist</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {uploadedTracks.map((t, i) => (
                            <div key={t.id} style={{
                              display: "grid", gridTemplateColumns: "24px 1fr 80px 80px 32px 32px",
                              alignItems: "center", gap: 12,
                              padding: "10px 12px", background: T.bg4,
                              borderRadius: 4, border: `1px solid ${T.border}`,
                            }}>
                              <span style={{ fontSize: 11, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>{String(i + 1).padStart(2, "0")}</span>
                              <div>
                                <div style={{ fontSize: 13, color: T.white }}>{t.title}</div>
                                <div style={{ fontSize: 10, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>{t.isrc}</div>
                              </div>
                              <span style={{ fontSize: 11, color: T.secondary, fontFamily: "JetBrains Mono, monospace" }}>{t.duration}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{
                                  width: 10, height: 10, borderRadius: "50%",
                                  background: t.explicit ? T.amber : T.muted,
                                  flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 10, color: T.muted }}>E</span>
                              </div>
                              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                                <Icon name="more" size={14} color={T.muted} />
                              </button>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2, cursor: "grab" }}>
                                {[0, 1, 2].map(l => <div key={l} style={{ height: 1, width: 12, background: T.muted }} />)}
                              </div>
                            </div>
                          ))}
                          <button style={{
                            padding: "12px", background: "none",
                            border: `1px dashed ${T.border2}`, borderRadius: 4,
                            color: T.secondary, fontSize: 12, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          }}>
                            <Icon name="plus" size={14} color={T.secondary} />
                            Add Track (WAV / FLAC)
                          </button>
                        </div>
                      </div>
                    )}

                    {uploadStep === 3 && (
                      <div>
                        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: T.white }}>Credits</h2>
                        {[
                          { role: "Artist", name: "R0YC0LD" },
                          { role: "Producer", name: "R0YC0LD" },
                          { role: "Mix Engineer", name: "– " },
                          { role: "Master Engineer", name: "–" },
                          { role: "Songwriter", name: "R0YC0LD" },
                        ].map((c, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, marginBottom: 10, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: T.secondary, letterSpacing: "0.06em" }}>{c.role.toUpperCase()}</span>
                            <input defaultValue={c.name} style={{
                              padding: "8px 12px", background: T.bg4,
                              border: `1px solid ${T.border}`, borderRadius: 4,
                              color: T.white, fontSize: 13, outline: "none", fontFamily: "inherit",
                            }} />
                          </div>
                        ))}
                        <div style={{ marginTop: 24, padding: 16, background: T.bg3, borderRadius: 6, border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 11, color: T.secondary, marginBottom: 8 }}>DISTRIBUTION</div>
                          <div style={{ fontSize: 13, color: T.primary }}>
                            "Günlük" will be distributed to R0YCL0UD, Spotify, Apple Music, and 40+ platforms upon approval.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step navigation */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
                    <button
                      onClick={() => setUploadStep(s => Math.max(0, s - 1))}
                      disabled={uploadStep === 0}
                      style={{
                        padding: "10px 24px", borderRadius: 4,
                        background: "none", border: `1px solid ${T.border}`,
                        color: uploadStep === 0 ? T.muted : T.primary,
                        fontSize: 13, cursor: uploadStep === 0 ? "default" : "pointer",
                      }}
                    >Previous</button>
                    <button
                      onClick={() => setUploadStep(s => Math.min(3, s + 1))}
                      style={{
                        padding: "10px 24px", borderRadius: 4,
                        background: uploadStep === 3 ? T.green : T.accent,
                        border: "none", color: T.white,
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >{uploadStep === 3 ? "Submit for Review" : "Continue"}</button>
                  </div>
                </div>
              ) : (
                /* Analytics Dashboard */
                <div>
                  {/* Stats cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
                    {[
                      { label: "Monthly Listeners", value: "24,812", delta: "+18.4%" },
                      { label: "Total Streams", value: "1.52M", delta: "+34.2%" },
                      { label: "Playlist Adds", value: "3,204", delta: "+7.1%" },
                      { label: "Avg. Listen Time", value: "3m 48s", delta: "-2.1%" },
                    ].map((stat, i) => (
                      <div key={i} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: 20 }}>
                        <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>{stat.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: T.white, fontFamily: "JetBrains Mono, monospace" }}>{stat.value}</div>
                        <div style={{ fontSize: 11, color: stat.delta.startsWith("+") ? T.green : T.red, marginTop: 4 }}>{stat.delta} this month</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                    {/* Stream chart */}
                    <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: 24 }}>
                      <div style={{ fontSize: 11, color: T.secondary, letterSpacing: "0.08em", marginBottom: 20 }}>DAILY STREAMS — LAST 28 DAYS</div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
                        {analyticsData.streams.map((d, i) => (
                          <div key={i} style={{
                            flex: 1, background: T.accent,
                            height: `${(d.count / maxStreams) * 100}%`,
                            borderRadius: "1px 1px 0 0", opacity: 0.7,
                            minHeight: 2,
                          }} title={`Day ${d.day}: ${d.count.toLocaleString()} streams`} />
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>
                        <span>1</span><span>7</span><span>14</span><span>21</span><span>28</span>
                      </div>
                    </div>

                    {/* Country breakdown */}
                    <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 6, padding: 24 }}>
                      <div style={{ fontSize: 11, color: T.secondary, letterSpacing: "0.08em", marginBottom: 20 }}>LISTENER GEOGRAPHY</div>
                      {analyticsData.countries.map((c) => (
                        <div key={c.code} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: T.primary }}>{c.name}</span>
                            <span style={{ fontSize: 11, color: T.secondary, fontFamily: "JetBrains Mono, monospace" }}>{c.pct}%</span>
                          </div>
                          <div style={{ height: 3, background: T.bg4, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${c.pct}%`, height: "100%", background: T.accent, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Library / Main View ── */
            <div style={{ flex: 1, overflow: "auto" }}>
              {/* Header */}
              <div style={{
                padding: "24px 32px 0",
                position: "sticky", top: 0,
                background: `linear-gradient(to bottom, ${T.bg1} 80%, transparent)`,
                zIndex: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Album</div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Günlük</h1>
                    <div style={{ fontSize: 13, color: T.secondary, marginTop: 4 }}>
                      R0YC0LD · 2025 · {MOCK_TRACKS.length} tracks · 36 min · Slow Rap / Concept
                    </div>
                  </div>
                  <CoverArt index="1" size={72} style={{ borderRadius: 6 }} />
                </div>

                {/* Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                  <button
                    onClick={() => setIsPlaying(p => !p)}
                    aria-label={isPlaying ? "Pause" : "Play"}
                    style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: T.accent, border: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <Icon name={isPlaying ? "pause" : "play"} size={18} color={T.white} />
                  </button>
                  <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} aria-label="Shuffle">
                    <Icon name="shuffle" size={18} color={shuffle ? T.accent : T.secondary} />
                  </button>
                  <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} aria-label="Add to library">
                    <Icon name="heart" size={18} color={T.secondary} />
                  </button>
                  <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} aria-label="More options">
                    <Icon name="more" size={18} color={T.secondary} />
                  </button>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    {["List", "Grid"].map((v, i) => (
                      <button key={v} style={{
                        padding: "4px 10px", fontSize: 11, borderRadius: 3,
                        background: i === 0 ? T.bg4 : "none",
                        border: `1px solid ${i === 0 ? T.border2 : "transparent"}`,
                        color: i === 0 ? T.primary : T.muted, cursor: "pointer",
                      }}>{v}</button>
                    ))}
                  </div>
                </div>

                {/* Column headers */}
                <div style={{
                  display: "grid", gridTemplateColumns: "24px 1fr 80px 80px 80px 32px",
                  padding: "10px 8px",
                  fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase",
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  <span>#</span>
                  <span>Title</span>
                  <span style={{ textAlign: "center" }}>Plays</span>
                  <span style={{ textAlign: "right" }}>Duration</span>
                  <span style={{ textAlign: "center" }}>Explicit</span>
                  <span />
                </div>
              </div>

              {/* Track list */}
              <div style={{ padding: "4px 32px 120px" }}>
                {MOCK_TRACKS.map((track, i) => {
                  const isActive = track.id === currentTrack.id;
                  return (
                    <div
                      key={track.id}
                      role="row"
                      aria-label={`${track.title} by ${track.artist}`}
                      onClick={() => { setCurrentTrack(track); setIsPlaying(true); setPosition(0); }}
                      onDoubleClick={() => { setCurrentTrack(track); setIsPlaying(true); }}
                      style={{
                        display: "grid", gridTemplateColumns: "24px 1fr 80px 80px 80px 32px",
                        alignItems: "center", padding: "6px 8px",
                        borderRadius: 4, gap: 12, cursor: "pointer",
                        background: isActive ? T.accentMuted : "none",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.bg3; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isActive && isPlaying ? (
                          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
                            {[0.6, 1, 0.4].map((h, j) => (
                              <div key={j} style={{ width: 2, height: `${h * 100}%`, background: T.accent, borderRadius: 1 }} />
                            ))}
                          </div>
                        ) : (
                          <span style={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 11, color: isActive ? T.accent : T.muted,
                          }}>{i + 1}</span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
                        <CoverArt index={track.cover} size={36} />
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ fontSize: 13, color: isActive ? T.accent : T.white, fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
                          <div style={{ fontSize: 11, color: T.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.artist}</div>
                        </div>
                      </div>

                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: T.secondary, textAlign: "center" }}>{track.plays}</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: T.secondary, textAlign: "right" }}>{track.duration}</span>
                      <div style={{ textAlign: "center" }}>
                        {track.explicit && (
                          <span style={{ fontSize: 9, background: T.bg5, color: T.secondary, padding: "2px 4px", borderRadius: 2, letterSpacing: "0.05em" }}>E</span>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setLiked(l => { const n = new Set(l); n.has(track.id) ? n.delete(track.id) : n.add(track.id); return n; }); }}
                        aria-label={liked.has(track.id) ? "Unlike track" : "Like track"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: liked.has(track.id) ? 1 : 0.3, display: "flex" }}
                      >
                        <Icon name={liked.has(track.id) ? "heart" : "heart_outline"} size={14} color={liked.has(track.id) ? T.accent : T.secondary} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* ── Spectrum Sidebar ── */}
        <div style={{
          width: 200, flexShrink: 0,
          background: T.bg1, borderLeft: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column", padding: 20,
        }}>
          <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Spectrum</div>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, minHeight: 100 }}>
            {spectrumData.map((v, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                <SpectrumBar height={v} index={i} />
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: T.border, margin: "16px 0" }} />

          {/* Now Playing mini */}
          <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Now Playing</div>
          <CoverArt index={currentTrack.cover} size={160} style={{ borderRadius: 4, width: "100%", height: 160 }} />
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.title}</div>
          <div style={{ fontSize: 11, color: T.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.artist}</div>

          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: T.muted }}>{formatTime(position)}</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: T.muted }}>{currentTrack.duration}</span>
          </div>

          <div style={{ height: 1, background: T.border, margin: "16px 0" }} />

          {/* EQ preview */}
          <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            EQ · {EQ_PRESETS[activePreset]?.name || "Custom"}
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 32 }}>
            {eqBands.map((v, i) => {
              const h = ((v + 12) / 24) * 100;
              return (
                <div key={i} style={{ flex: 1, position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: T.border }} />
                  <div style={{ width: 2, height: `${Math.abs(v) / 12 * 50}%`, background: v >= 0 ? T.accent : T.red, borderRadius: 1, position: "absolute", [v >= 0 ? "bottom" : "top"]: "50%" }} />
                </div>
              );
            })}
          </div>

          <button
            onClick={() => { setShowSettings(true); setSettingsTab("playback"); }}
            style={{
              marginTop: 12, padding: "7px 0", background: "none",
              border: `1px solid ${T.border}`, borderRadius: 4,
              color: T.secondary, fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Icon name="eq" size={12} color={T.secondary} />
            Open Equalizer
          </button>
        </div>
      </div>

      {/* ── Player Bar ── */}
      <div style={s.playerBar} role="region" aria-label="Playback controls">
        {/* Left: Track info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
          <CoverArt index={currentTrack.cover} size={48} style={{ borderRadius: 4 }} />
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.title}</div>
            <div style={{ fontSize: 11, color: T.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.artist}</div>
          </div>
          <button
            onClick={() => setLiked(l => { const n = new Set(l); n.has(currentTrack.id) ? n.delete(currentTrack.id) : n.add(currentTrack.id); return n; })}
            aria-label="Like current track"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0, opacity: liked.has(currentTrack.id) ? 1 : 0.4 }}
          >
            <Icon name={liked.has(currentTrack.id) ? "heart" : "heart_outline"} size={16} color={liked.has(currentTrack.id) ? T.accent : T.secondary} />
          </button>
        </div>

        {/* Center: Transport + progress */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {/* Transport buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShuffle(s => !s)}
              aria-label="Toggle shuffle"
              aria-pressed={shuffle}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, opacity: shuffle ? 1 : 0.5 }}
            >
              <Icon name="shuffle" size={14} color={shuffle ? T.accent : T.secondary} />
            </button>
            <button onClick={() => skipTrack(-1)} aria-label="Previous track" style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
              <Icon name="skip_prev" size={18} color={T.primary} />
            </button>
            <button
              onClick={() => setIsPlaying(p => !p)}
              aria-label={isPlaying ? "Pause" : "Play"}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: T.white, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Icon name={isPlaying ? "pause" : "play"} size={16} color={T.bg0} />
            </button>
            <button onClick={() => skipTrack(1)} aria-label="Next track" style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
              <Icon name="skip_next" size={18} color={T.primary} />
            </button>
            <button
              onClick={() => setRepeat(r => r === "off" ? "queue" : r === "queue" ? "track" : "off")}
              aria-label={`Repeat: ${repeat}`}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, opacity: repeat !== "off" ? 1 : 0.5 }}
            >
              <Icon name={repeat === "track" ? "repeat_one" : "repeat"} size={14} color={repeat !== "off" ? T.accent : T.secondary} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: T.muted, width: 32, textAlign: "right" }}>
              {formatTime(position)}
            </span>
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              role="slider"
              aria-label="Playback position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(position * 100)}
              tabIndex={0}
              style={{ flex: 1, height: 3, background: T.bg5, borderRadius: 2, cursor: "pointer", position: "relative" }}
              onMouseEnter={e => e.currentTarget.querySelector(".thumb").style.opacity = "1"}
              onMouseLeave={e => e.currentTarget.querySelector(".thumb") && (e.currentTarget.querySelector(".thumb").style.opacity = "0")}
            >
              {/* Buffered */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, position * 100 + 20)}%`, background: T.bg5, borderRadius: 2 }} />
              {/* Played */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${position * 100}%`, background: T.white, borderRadius: 2 }} />
              {/* Thumb */}
              <div className="thumb" style={{
                position: "absolute", top: "50%", left: `${position * 100}%`,
                transform: "translate(-50%, -50%)",
                width: 10, height: 10, borderRadius: "50%",
                background: T.white, opacity: 0, transition: "opacity 0.1s",
              }} />
            </div>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: T.muted, width: 32 }}>
              {currentTrack.duration}
            </span>
          </div>
        </div>

        {/* Right: Volume + extras */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => setShowQueue(q => !q)}
            aria-label="Toggle queue"
            aria-pressed={showQueue}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, opacity: showQueue ? 1 : 0.5 }}
          >
            <Icon name="queue" size={16} color={showQueue ? T.accent : T.secondary} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setIsMuted(m => !m)}
              aria-label={isMuted ? "Unmute" : "Mute"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              <Icon name={isMuted ? "volume_mute" : "volume"} size={16} color={T.secondary} />
            </button>
            <div
              role="slider"
              aria-label="Volume"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(volume * 100)}
              style={{ width: 80, height: 3, background: T.bg5, borderRadius: 2, cursor: "pointer", position: "relative" }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}
              tabIndex={0}
            >
              <div style={{ width: `${(isMuted ? 0 : volume) * 100}%`, height: "100%", background: T.white, borderRadius: 2 }} />
            </div>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: T.muted, width: 24 }}>
              {isMuted ? "–" : Math.round(volume * 100)}
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: T.border }} />

          {/* Quality badge */}
          <div style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 9,
            color: streamQuality === "lossless" ? T.amber : T.muted,
            letterSpacing: "0.06em", border: `1px solid ${streamQuality === "lossless" ? T.amber : T.border}`,
            padding: "2px 6px", borderRadius: 2,
          }}>
            {streamQuality === "lossless" ? "FLAC" : streamQuality === "high" ? "320K" : streamQuality === "normal" ? "160K" : "96K"}
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <div style={{
            width: 800, height: 580, background: T.bg2,
            border: `1px solid ${T.border}`, borderRadius: 8,
            display: "flex", overflow: "hidden",
          }}>
            {/* Settings sidebar */}
            <div style={{ width: 180, background: T.bg1, borderRight: `1px solid ${T.border}`, padding: "24px 0" }}>
              <div style={{ padding: "0 16px 16px", fontSize: 11, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Settings</div>
              {SETTINGS_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 16px", background: "none", border: "none",
                    cursor: "pointer", width: "100%", textAlign: "left",
                    color: settingsTab === tab.id ? T.white : T.secondary,
                    fontSize: 12, fontWeight: settingsTab === tab.id ? 500 : 400,
                    borderLeft: `2px solid ${settingsTab === tab.id ? T.accent : "transparent"}`,
                  }}
                >
                  <Icon name={tab.icon} size={14} color={settingsTab === tab.id ? T.white : T.secondary} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Settings content */}
            <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
              {/* Close */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  {SETTINGS_TABS.find(t => t.id === settingsTab)?.label}
                </h2>
                <button onClick={() => setShowSettings(false)} aria-label="Close settings" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                  <Icon name="close" size={18} color={T.secondary} />
                </button>
              </div>

              {settingsTab === "account" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, background: T.bg3, borderRadius: 6, marginBottom: 24 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="user" size={24} color={T.white} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>R0YC0LD</div>
                      <div style={{ fontSize: 12, color: T.secondary }}>roycold@r0ycl0ud.io</div>
                      <div style={{ fontSize: 10, color: T.amber, marginTop: 4, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em" }}>★ AUDIOPHILE TIER</div>
                    </div>
                  </div>
                  {[
                    { label: "Display Name", value: "R0YC0LD" },
                    { label: "Email Address", value: "roycold@r0ycl0ud.io" },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 16 }}>
                      <label style={{ display: "block", fontSize: 11, color: T.secondary, marginBottom: 6, letterSpacing: "0.06em" }}>{f.label.toUpperCase()}</label>
                      <input defaultValue={f.value} style={{ width: "100%", padding: "10px 12px", background: T.bg4, border: `1px solid ${T.border}`, borderRadius: 4, color: T.white, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button style={{ padding: "8px 20px", background: T.accent, border: "none", borderRadius: 4, color: T.white, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Save Changes</button>
                    <button style={{ padding: "8px 20px", background: "none", border: `1px solid ${T.border}`, borderRadius: 4, color: T.secondary, fontSize: 12, cursor: "pointer" }}>Enable 2FA</button>
                  </div>
                </div>
              )}

              {settingsTab === "audio" && (
                <div>
                  {/* Quality toggles */}
                  {[
                    { label: "Wi-Fi Streaming Quality", state: streamQuality, set: setStreamQuality },
                    { label: "Cellular Streaming Quality", state: "normal", set: () => {} },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, color: T.secondary, marginBottom: 8 }}>{row.label.toUpperCase()}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {["low", "normal", "high", "lossless"].map(q => (
                          <button
                            key={q}
                            onClick={() => row.set(q)}
                            style={{
                              padding: "7px 14px", borderRadius: 4,
                              background: row.state === q ? T.accent : T.bg4,
                              border: `1px solid ${row.state === q ? T.accent : T.border}`,
                              color: row.state === q ? T.white : T.secondary,
                              fontSize: 11, cursor: "pointer", textTransform: "capitalize",
                              fontFamily: row.state === q ? "inherit" : "inherit",
                            }}
                          >
                            {q === "lossless" ? "Lossless (FLAC)" : q.charAt(0).toUpperCase() + q.slice(1)}
                          </button>
                        ))}
                      </div>
                      {row.state === "lossless" && (
                        <div style={{ marginTop: 8, fontSize: 11, color: T.amber, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name="info" size={12} color={T.amber} />
                          Uses significantly more data. Requires Audiophile Tier.
                        </div>
                      )}
                    </div>
                  ))}

                  <div style={{ height: 1, background: T.border, margin: "20px 0" }} />

                  {/* Toggle switches */}
                  {[
                    { label: "Normalize Volume (LUFS)", desc: "Equalizes perceived loudness across all tracks", value: normalizeVolume, set: setNormalizeVolume },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 13, color: T.primary }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{item.desc}</div>
                      </div>
                      <button
                        onClick={() => item.set(v => !v)}
                        role="switch"
                        aria-checked={item.value}
                        style={{
                          width: 44, height: 24, borderRadius: 12,
                          background: item.value ? T.accent : T.bg5,
                          border: `1px solid ${item.value ? T.accent : T.border}`,
                          cursor: "pointer", position: "relative", flexShrink: 0,
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{
                          position: "absolute", top: 2, left: item.value ? 20 : 2,
                          width: 18, height: 18, borderRadius: "50%", background: T.white,
                          transition: "left 0.15s",
                        }} />
                      </button>
                    </div>
                  ))}

                  <div style={{ height: 1, background: T.border, margin: "20px 0" }} />

                  {/* Cache size */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 13, color: T.primary }}>Offline Cache Allocation</div>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: T.accent }}>{cacheSize} GB</span>
                    </div>
                    <input
                      type="range" min={1} max={50} value={cacheSize}
                      onChange={e => setCacheSize(Number(e.target.value))}
                      aria-label="Cache size in GB"
                      style={{ width: "100%", accentColor: T.accent }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>1 GB</span>
                      <span style={{ fontSize: 10, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>50 GB</span>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === "playback" && (
                <div>
                  {/* EQ */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>10-Band Parametric Equalizer</div>
                    <button
                      onClick={() => setEqEnabled(e => !e)}
                      role="switch"
                      aria-checked={eqEnabled}
                      style={{
                        width: 44, height: 24, borderRadius: 12,
                        background: eqEnabled ? T.accent : T.bg5,
                        border: `1px solid ${eqEnabled ? T.accent : T.border}`,
                        cursor: "pointer", position: "relative",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ position: "absolute", top: 2, left: eqEnabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.15s" }} />
                    </button>
                  </div>

                  {/* Presets */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {Object.entries(EQ_PRESETS).map(([id, preset]) => (
                      <button
                        key={id}
                        onClick={() => applyPreset(id)}
                        style={{
                          padding: "5px 12px", borderRadius: 3,
                          background: activePreset === id ? T.accent : T.bg4,
                          border: `1px solid ${activePreset === id ? T.accent : T.border}`,
                          color: activePreset === id ? T.white : T.secondary,
                          fontSize: 11, cursor: "pointer",
                        }}
                      >{preset.name}</button>
                    ))}
                    {activePreset === "custom" && (
                      <button style={{ padding: "5px 12px", borderRadius: 3, background: T.bg4, border: `1px solid ${T.border}`, color: T.secondary, fontSize: 11, cursor: "pointer" }}>
                        Save Preset…
                      </button>
                    )}
                  </div>

                  {/* Preamp */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: T.secondary, letterSpacing: "0.06em" }}>PREAMP</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: preamp === 0 ? T.muted : preamp > 0 ? T.accent : T.red }}>
                        {preamp > 0 ? "+" : ""}{preamp.toFixed(1)} dB
                      </span>
                    </div>
                    <input type="range" min={-12} max={12} step={0.1} value={preamp}
                      onChange={e => setPreamp(Number(e.target.value))}
                      style={{ width: "100%", accentColor: T.accent }}
                      aria-label="Preamp gain"
                    />
                  </div>

                  {/* EQ Bands */}
                  <div style={{ display: "flex", gap: 8, padding: "0 8px", opacity: eqEnabled ? 1 : 0.4 }}>
                    {EQ_BANDS.map((band, i) => (
                      <EQSlider
                        key={band.freq}
                        value={eqBands[i]}
                        onChange={v => setBand(i, v)}
                        label={band.label}
                        freq={band.freq}
                      />
                    ))}
                  </div>

                  <div style={{ height: 1, background: T.border, margin: "20px 0" }} />

                  {/* Crossfade */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: T.primary }}>Crossfade Duration</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: T.secondary }}>{crossfade}s</span>
                    </div>
                    <input type="range" min={0} max={12} step={0.5} value={crossfade}
                      onChange={e => setCrossfade(Number(e.target.value))}
                      style={{ width: "100%", accentColor: T.accent }}
                      aria-label="Crossfade duration"
                    />
                  </div>

                  {/* Gapless */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, color: T.primary }}>Gapless Playback</div>
                      <div style={{ fontSize: 11, color: T.muted }}>Eliminates silence between tracks</div>
                    </div>
                    <button
                      onClick={() => setGapless(g => !g)}
                      role="switch" aria-checked={gapless}
                      style={{ width: 44, height: 24, borderRadius: 12, background: gapless ? T.accent : T.bg5, border: `1px solid ${gapless ? T.accent : T.border}`, cursor: "pointer", position: "relative", transition: "background 0.15s" }}
                    >
                      <div style={{ position: "absolute", top: 2, left: gapless ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: T.white, transition: "left 0.15s" }} />
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === "devices" && (
                <div>
                  <div style={{ padding: 16, background: T.bg3, borderRadius: 6, marginBottom: 20, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, color: T.secondary, marginBottom: 4 }}>ACTIVE OUTPUT</div>
                    <div style={{ fontSize: 13, color: T.white }}>Default System Output</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Hardware acceleration: Enabled</div>
                  </div>
                  {["Default System Output", "Headphones (USB Audio)", "Built-in Speakers", "HDMI Output"].map((dev, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", borderRadius: 4, marginBottom: 8,
                      background: i === 0 ? T.accentMuted : T.bg3,
                      border: `1px solid ${i === 0 ? T.accent : T.border}`,
                    }}>
                      <span style={{ fontSize: 13, color: i === 0 ? T.accent : T.primary }}>{dev}</span>
                      {i === 0 ? <Icon name="check" size={14} color={T.accent} /> : (
                        <button style={{ padding: "4px 12px", background: T.bg4, border: `1px solid ${T.border}`, borderRadius: 3, color: T.secondary, fontSize: 11, cursor: "pointer" }}>Select</button>
                      )}
                    </div>
                  ))}
                  <div style={{ marginTop: 16, fontSize: 11, color: T.muted }}>
                    Audio routing via <code style={{ fontFamily: "JetBrains Mono, monospace", color: T.secondary }}>HTMLMediaElement.setSinkId()</code> · enumerate via <code style={{ fontFamily: "JetBrains Mono, monospace", color: T.secondary }}>navigator.mediaDevices</code>
                  </div>
                </div>
              )}

              {settingsTab === "shortcuts" && (
                <div>
                  <div style={{ marginBottom: 16, fontSize: 12, color: T.secondary }}>
                    Click any shortcut to rebind it. Changes take effect immediately.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {KEYBOARD_SHORTCUTS.map((sc, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 4, background: i % 2 === 0 ? T.bg3 : "none" }}>
                        <span style={{ fontSize: 13, color: T.primary }}>{sc.action}</span>
                        <kbd style={{
                          fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                          padding: "3px 8px", borderRadius: 3,
                          background: T.bg5, border: `1px solid ${T.border2}`,
                          color: T.secondary, letterSpacing: "0.06em",
                        }}>{sc.key}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
