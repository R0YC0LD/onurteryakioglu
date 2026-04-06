/**
 * R0YCL0UD — Global State Store
 * store/useStore.ts
 *
 * Zustand store with immer middleware for safe mutations.
 * Structured into three slices: Player, EQ, UI.
 * Persisted selectively via zustand/middleware/persist.
 */

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage } from 'zustand/middleware';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type RepeatMode = 'off' | 'track' | 'queue';
export type StreamingQuality = 'low' | 'normal' | 'high' | 'lossless';

export interface Track {
  id: string;
  albumId: string;
  title: string;
  artistName: string;
  artistId: string;
  albumTitle: string;
  durationMs: number;
  audioUrl: string;
  audioLosslessUrl?: string;
  coverUrl: string;
  explicit: boolean;
  trackNumber: number;
  playCount: number;
  isrc?: string;
  bpm?: number;
}

export interface QueueEntry {
  track: Track;
  queueId: string;   // Unique per-insertion ID (uuid) to allow duplicate tracks in queue
  source: 'manual' | 'auto' | 'upnext';
}

export interface EQBand {
  frequency: number;  // Hz
  gain: number;       // dB (-12 to +12)
  type: BiquadFilterType;
  Q: number;
}

export interface EQPreset {
  id: string;
  name: string;
  preampDb: number;
  bands: number[]; // 10 values, indexed 0-9
  isBuiltIn: boolean;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  targetId?: string;
}

export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: string;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  durationMs: number;
}

// ============================================================
// BUILT-IN EQ PRESETS
// ============================================================

export const BUILT_IN_PRESETS: EQPreset[] = [
  {
    id: 'flat',
    name: 'Flat',
    preampDb: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    isBuiltIn: true,
  },
  {
    id: 'studio-reference',
    name: 'Studio Reference',
    preampDb: -1,
    bands: [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5, 0.5, 1],
    isBuiltIn: true,
  },
  {
    id: 'bass-boost',
    name: 'Bass Boost',
    preampDb: -2,
    bands: [6, 5, 4, 2, 1, 0, 0, 0, 0, 0],
    isBuiltIn: true,
  },
  {
    id: 'vocal-detail',
    name: 'Vocal Detail',
    preampDb: -1,
    bands: [-2, -2, -1, 0, 2, 3, 4, 3, 2, 1],
    isBuiltIn: true,
  },
  {
    id: 'acoustic',
    name: 'Acoustic',
    preampDb: 0,
    bands: [3, 2, 1, 0, 0, 1, 2, 3, 3, 2],
    isBuiltIn: true,
  },
  {
    id: 'late-night',
    name: 'Late Night',
    preampDb: -3,
    bands: [2, 1, 0, -1, -2, -3, -2, -1, 0, 1],
    isBuiltIn: true,
  },
];

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

// ============================================================
// SLICE: Player
// ============================================================

export interface PlayerSlice {
  // Current state
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMs: number;
  bufferedMs: number;
  volume: number;           // 0.0 to 1.0
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  crossfadeSeconds: number;
  isLoadingTrack: boolean;

  // Queue system
  queue: QueueEntry[];         // Full playback sequence
  upNext: QueueEntry[];        // User's manually inserted "play next" items
  history: Track[];            // Played tracks (max 200)
  autoPlayQueue: QueueEntry[]; // Algorithmic/radio continuation

  // Actions — Playback
  setCurrentTrack: (track: Track | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setPosition: (ms: number) => void;
  setBuffered: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  setCrossfade: (seconds: number) => void;
  setIsLoadingTrack: (loading: boolean) => void;

  // Actions — Queue management
  playTrack: (track: Track, context?: QueueEntry[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (track: Track) => void;
  addToUpNext: (track: Track) => void;
  removeFromQueue: (queueId: string) => void;
  clearQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  setAutoPlayQueue: (entries: QueueEntry[]) => void;
  saveQueueAsPlaylist: () => QueueEntry[];
  pushToHistory: (track: Track) => void;
}

const createPlayerSlice = (
  set: (fn: (state: PlayerSlice) => void) => void,
  get: () => PlayerSlice & EQSlice & UISlice
): PlayerSlice => ({
  currentTrack: null,
  isPlaying: false,
  positionMs: 0,
  bufferedMs: 0,
  volume: 0.8,
  isMuted: false,
  repeatMode: 'off',
  isShuffle: false,
  crossfadeSeconds: 0,
  isLoadingTrack: false,
  queue: [],
  upNext: [],
  history: [],
  autoPlayQueue: [],

  setCurrentTrack: (track) =>
    set((s) => { s.currentTrack = track; }),

  setIsPlaying: (playing) =>
    set((s) => { s.isPlaying = playing; }),

  setPosition: (ms) =>
    set((s) => { s.positionMs = ms; }),

  setBuffered: (ms) =>
    set((s) => { s.bufferedMs = ms; }),

  setVolume: (v) =>
    set((s) => {
      s.volume = Math.max(0, Math.min(1, v));
      if (v > 0) s.isMuted = false;
    }),

  toggleMute: () =>
    set((s) => { s.isMuted = !s.isMuted; }),

  setRepeatMode: (mode) =>
    set((s) => { s.repeatMode = mode; }),

  toggleShuffle: () =>
    set((s) => { s.isShuffle = !s.isShuffle; }),

  setCrossfade: (seconds) =>
    set((s) => { s.crossfadeSeconds = Math.max(0, Math.min(12, seconds)); }),

  setIsLoadingTrack: (loading) =>
    set((s) => { s.isLoadingTrack = loading; }),

  playTrack: (track, context) =>
    set((s) => {
      // Push current track to history
      if (s.currentTrack) {
        s.history = [s.currentTrack, ...s.history].slice(0, 200);
      }
      s.currentTrack = track;
      s.isPlaying = true;
      s.positionMs = 0;
      s.isLoadingTrack = true;

      // Replace queue with context if provided, else keep existing
      if (context) {
        // Start queue from the selected track
        const startIdx = context.findIndex((e) => e.track.id === track.id);
        s.queue = startIdx >= 0 ? context.slice(startIdx + 1) : context;
      }
    }),

  playNext: () =>
    set((s) => {
      if (s.currentTrack) {
        s.history = [s.currentTrack, ...s.history].slice(0, 200);
      }

      // Resolve next source: upNext > queue > autoPlayQueue
      let next: QueueEntry | undefined;
      if (s.upNext.length > 0) {
        [next, ...s.upNext] = s.upNext;
      } else if (s.queue.length > 0) {
        [next, ...s.queue] = s.queue;
      } else if (s.autoPlayQueue.length > 0) {
        [next, ...s.autoPlayQueue] = s.autoPlayQueue;
      }

      if (next) {
        s.currentTrack = next.track;
        s.positionMs = 0;
        s.isPlaying = true;
        s.isLoadingTrack = true;
      } else if (s.repeatMode === 'queue' && s.history.length > 0) {
        // Re-queue the history
        s.currentTrack = s.history[s.history.length - 1];
        s.history = [];
        s.positionMs = 0;
        s.isPlaying = true;
        s.isLoadingTrack = true;
      } else {
        s.isPlaying = false;
      }
    }),

  playPrevious: () =>
    set((s) => {
      // If > 3 seconds in: restart; else go back
      if (s.positionMs > 3000) {
        s.positionMs = 0;
        return;
      }
      if (s.history.length > 0) {
        const [prev, ...rest] = s.history;
        if (s.currentTrack) {
          s.queue = [
            { track: s.currentTrack, queueId: crypto.randomUUID(), source: 'manual' },
            ...s.queue,
          ];
        }
        s.currentTrack = prev;
        s.history = rest;
        s.positionMs = 0;
        s.isPlaying = true;
        s.isLoadingTrack = true;
      } else {
        s.positionMs = 0;
      }
    }),

  addToQueue: (track) =>
    set((s) => {
      s.queue = [
        ...s.queue,
        { track, queueId: crypto.randomUUID(), source: 'manual' },
      ];
    }),

  addToUpNext: (track) =>
    set((s) => {
      s.upNext = [
        { track, queueId: crypto.randomUUID(), source: 'upnext' },
        ...s.upNext,
      ];
    }),

  removeFromQueue: (queueId) =>
    set((s) => {
      s.queue = s.queue.filter((e) => e.queueId !== queueId);
      s.upNext = s.upNext.filter((e) => e.queueId !== queueId);
    }),

  clearQueue: () =>
    set((s) => {
      s.queue = [];
      s.upNext = [];
      s.autoPlayQueue = [];
    }),

  reorderQueue: (fromIndex, toIndex) =>
    set((s) => {
      const combined = [...s.upNext, ...s.queue];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= combined.length || toIndex >= combined.length) return;
      const [item] = combined.splice(fromIndex, 1);
      combined.splice(toIndex, 0, item);
      const upNextCount = s.upNext.length;
      s.upNext = combined.slice(0, upNextCount);
      s.queue = combined.slice(upNextCount);
    }),

  setAutoPlayQueue: (entries) =>
    set((s) => { s.autoPlayQueue = entries; }),

  saveQueueAsPlaylist: () => {
    const state = get();
    return [...state.upNext, ...state.queue];
  },

  pushToHistory: (track) =>
    set((s) => {
      s.history = [track, ...s.history].slice(0, 200);
    }),
});

// ============================================================
// SLICE: EQ (10-Band Parametric Equalizer)
// ============================================================

export interface EQSlice {
  isEQEnabled: boolean;
  preampDb: number;
  bands: number[];          // 10 gain values in dB
  currentPresetId: string;
  userPresets: EQPreset[];
  showEQPanel: boolean;

  setEQEnabled: (enabled: boolean) => void;
  setPreamp: (db: number) => void;
  setBandGain: (bandIndex: number, gainDb: number) => void;
  setBands: (bands: number[]) => void;
  applyPreset: (presetId: string) => void;
  saveCurrentAsPreset: (name: string) => void;
  deleteUserPreset: (presetId: string) => void;
  resetEQ: () => void;
  setShowEQPanel: (show: boolean) => void;
}

const createEQSlice = (
  set: (fn: (state: EQSlice) => void) => void,
  _get: () => PlayerSlice & EQSlice & UISlice
): EQSlice => ({
  isEQEnabled: true,
  preampDb: 0,
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  currentPresetId: 'flat',
  userPresets: [],
  showEQPanel: false,

  setEQEnabled: (enabled) =>
    set((s) => { s.isEQEnabled = enabled; }),

  setPreamp: (db) =>
    set((s) => {
      s.preampDb = Math.max(-12, Math.min(12, db));
      s.currentPresetId = 'custom';
    }),

  setBandGain: (bandIndex, gainDb) =>
    set((s) => {
      if (bandIndex < 0 || bandIndex >= 10) return;
      s.bands[bandIndex] = Math.max(-12, Math.min(12, gainDb));
      s.currentPresetId = 'custom';
    }),

  setBands: (bands) =>
    set((s) => {
      s.bands = bands.map((b) => Math.max(-12, Math.min(12, b)));
    }),

  applyPreset: (presetId) =>
    set((s) => {
      const allPresets = [...BUILT_IN_PRESETS, ...s.userPresets];
      const preset = allPresets.find((p) => p.id === presetId);
      if (!preset) return;
      s.preampDb = preset.preampDb;
      s.bands = [...preset.bands];
      s.currentPresetId = presetId;
    }),

  saveCurrentAsPreset: (name) =>
    set((s) => {
      const newPreset: EQPreset = {
        id: crypto.randomUUID(),
        name,
        preampDb: s.preampDb,
        bands: [...s.bands],
        isBuiltIn: false,
      };
      s.userPresets = [...s.userPresets, newPreset];
      s.currentPresetId = newPreset.id;
    }),

  deleteUserPreset: (presetId) =>
    set((s) => {
      s.userPresets = s.userPresets.filter((p) => p.id !== presetId);
      if (s.currentPresetId === presetId) {
        s.currentPresetId = 'flat';
        s.bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        s.preampDb = 0;
      }
    }),

  resetEQ: () =>
    set((s) => {
      s.bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      s.preampDb = 0;
      s.currentPresetId = 'flat';
    }),

  setShowEQPanel: (show) =>
    set((s) => { s.showEQPanel = show; }),
});

// ============================================================
// SLICE: UI
// ============================================================

export type ModalType =
  | 'settings'
  | 'eq'
  | 'queue'
  | 'create-playlist'
  | 'add-to-playlist'
  | 'upload'
  | null;

export interface UISlice {
  // Modal system
  activeModal: ModalType;
  modalData: Record<string, unknown>;

  // Sidebar
  sidebarWidth: number;   // px
  isSidebarCollapsed: boolean;
  rightPanelOpen: boolean;

  // Context menu
  contextMenu: ContextMenuState;

  // Toasts
  toasts: ToastMessage[];

  // Settings tab
  activeSettingsTab: string;

  // Now Playing view
  isNowPlayingExpanded: boolean;

  // Search
  searchQuery: string;
  isSearchFocused: boolean;

  // Actions
  openModal: (type: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebarCollapsed: () => void;
  toggleRightPanel: () => void;
  openContextMenu: (x: number, y: number, items: ContextMenuItem[], targetId?: string) => void;
  closeContextMenu: () => void;
  pushToast: (message: string, type?: ToastMessage['type'], durationMs?: number) => void;
  dismissToast: (id: string) => void;
  setActiveSettingsTab: (tab: string) => void;
  setNowPlayingExpanded: (expanded: boolean) => void;
  setSearchQuery: (q: string) => void;
  setSearchFocused: (focused: boolean) => void;
}

const createUISlice = (
  set: (fn: (state: UISlice) => void) => void,
  _get: () => PlayerSlice & EQSlice & UISlice
): UISlice => ({
  activeModal: null,
  modalData: {},
  sidebarWidth: 240,
  isSidebarCollapsed: false,
  rightPanelOpen: false,
  contextMenu: { isOpen: false, x: 0, y: 0, items: [] },
  toasts: [],
  activeSettingsTab: 'audio-quality',
  isNowPlayingExpanded: false,
  searchQuery: '',
  isSearchFocused: false,

  openModal: (type, data = {}) =>
    set((s) => {
      s.activeModal = type;
      s.modalData = data;
    }),

  closeModal: () =>
    set((s) => {
      s.activeModal = null;
      s.modalData = {};
    }),

  setSidebarWidth: (width) =>
    set((s) => {
      s.sidebarWidth = Math.max(180, Math.min(400, width));
    }),

  toggleSidebarCollapsed: () =>
    set((s) => { s.isSidebarCollapsed = !s.isSidebarCollapsed; }),

  toggleRightPanel: () =>
    set((s) => { s.rightPanelOpen = !s.rightPanelOpen; }),

  openContextMenu: (x, y, items, targetId) =>
    set((s) => {
      s.contextMenu = { isOpen: true, x, y, items, targetId };
    }),

  closeContextMenu: () =>
    set((s) => { s.contextMenu.isOpen = false; }),

  pushToast: (message, type = 'info', durationMs = 3000) =>
    set((s) => {
      const id = crypto.randomUUID();
      s.toasts = [...s.toasts, { id, message, type, durationMs }];
    }),

  dismissToast: (id) =>
    set((s) => {
      s.toasts = s.toasts.filter((t) => t.id !== id);
    }),

  setActiveSettingsTab: (tab) =>
    set((s) => { s.activeSettingsTab = tab; }),

  setNowPlayingExpanded: (expanded) =>
    set((s) => { s.isNowPlayingExpanded = expanded; }),

  setSearchQuery: (q) =>
    set((s) => { s.searchQuery = q; }),

  setSearchFocused: (focused) =>
    set((s) => { s.isSearchFocused = focused; }),
});

// ============================================================
// COMBINED STORE
// ============================================================

export type RootStore = PlayerSlice & EQSlice & UISlice;

export const useStore = create<RootStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        immer((...args) => {
          const [set, get] = args;
          return {
            ...createPlayerSlice(set as (fn: (state: PlayerSlice) => void) => void, get as () => RootStore),
            ...createEQSlice(set as (fn: (state: EQSlice) => void) => void, get as () => RootStore),
            ...createUISlice(set as (fn: (state: UISlice) => void) => void, get as () => RootStore),
          };
        }),
        {
          name: 'r0ycl0ud-store',
          storage: createJSONStorage(() => localStorage),
          // Only persist user preferences, not transient state
          partialize: (state) => ({
            volume: state.volume,
            isMuted: state.isMuted,
            repeatMode: state.repeatMode,
            isShuffle: state.isShuffle,
            crossfadeSeconds: state.crossfadeSeconds,
            isEQEnabled: state.isEQEnabled,
            preampDb: state.preampDb,
            bands: state.bands,
            currentPresetId: state.currentPresetId,
            userPresets: state.userPresets,
            sidebarWidth: state.sidebarWidth,
            isSidebarCollapsed: state.isSidebarCollapsed,
            activeSettingsTab: state.activeSettingsTab,
          }),
        }
      )
    ),
    { name: 'R0YCL0UD Store' }
  )
);

// ============================================================
// SELECTORS (memoized)
// ============================================================

export const selectCurrentTrack = (s: RootStore) => s.currentTrack;
export const selectIsPlaying = (s: RootStore) => s.isPlaying;
export const selectVolume = (s: RootStore) => ({ volume: s.volume, isMuted: s.isMuted });
export const selectRepeat = (s: RootStore) => s.repeatMode;
export const selectShuffle = (s: RootStore) => s.isShuffle;
export const selectQueue = (s: RootStore) => ({
  upNext: s.upNext,
  queue: s.queue,
  autoPlay: s.autoPlayQueue,
});
export const selectEQ = (s: RootStore) => ({
  isEnabled: s.isEQEnabled,
  preampDb: s.preampDb,
  bands: s.bands,
  currentPresetId: s.currentPresetId,
  userPresets: s.userPresets,
});
export const selectUI = (s: RootStore) => ({
  activeModal: s.activeModal,
  sidebarWidth: s.sidebarWidth,
  isSidebarCollapsed: s.isSidebarCollapsed,
  contextMenu: s.contextMenu,
  toasts: s.toasts,
});
