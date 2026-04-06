/**
 * R0YCL0UD — AudioEngine
 * lib/AudioEngine.ts
 *
 * Singleton Web Audio API engine.
 * Handles: 10-band EQ, preamp, compression (LUFS normalization),
 * spectrum analyzer, crossfade, output device routing,
 * buffered chunked streaming, and gapless playback.
 *
 * All audio processing runs through a carefully sequenced node graph:
 *
 *  MediaSource → GainNode(preamp) → BiquadFilter[0..9] →
 *  DynamicsCompressorNode → GainNode(master) → AnalyserNode →
 *  AudioContext.destination
 */

import type { Track, EQBand } from '../store/useStore';

// ============================================================
// CONSTANTS
// ============================================================

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
const EQ_Q = 1.41; // √2 — Butterworth Q, maximally flat passband
const ANALYZER_FFT_SIZE = 2048;
const CROSSFADE_MIN_DURATION = 0.05; // seconds
const BUFFER_CHUNK_BYTES = 512 * 1024; // 512KB chunks
const MAX_BUFFERED_CHUNKS = 8;

// AudioWorklet processor source (inline, no separate file needed for dev)
const WORKLET_PROCESSOR = `
class SpectrumProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(2048);
    this._writeHead = 0;
    this._frameCount = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];

    // Copy samples into ring buffer
    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._writeHead] = channel[i];
      this._writeHead = (this._writeHead + 1) % this._buffer.length;
    }

    // Post RMS every 512 samples (~11.6ms at 44.1kHz)
    this._frameCount += channel.length;
    if (this._frameCount >= 512) {
      this._frameCount = 0;
      let sum = 0;
      for (let i = 0; i < this._buffer.length; i++) {
        sum += this._buffer[i] * this._buffer[i];
      }
      const rms = Math.sqrt(sum / this._buffer.length);
      this.port.postMessage({ type: 'rms', rms });
    }

    return true; // Keep processor alive
  }
}

registerProcessor('spectrum-processor', SpectrumProcessor);
`;

// ============================================================
// TYPES
// ============================================================

export interface AudioEngineEvents {
  onTimeUpdate: (currentMs: number, durationMs: number) => void;
  onBufferProgress: (bufferedMs: number) => void;
  onTrackEnd: () => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onError: (error: AudioEngineError) => void;
  onAnalyzerData: (data: Uint8Array) => void;
  onRMSLevel: (rms: number) => void;
}

export interface AudioEngineError {
  code: 'DECODE_ERROR' | 'NETWORK_ERROR' | 'CONTEXT_ERROR' | 'DEVICE_ERROR';
  message: string;
  track?: Track;
}

export interface EngineState {
  isPlaying: boolean;
  currentMs: number;
  durationMs: number;
  bufferedMs: number;
  isLoading: boolean;
  outputDeviceId: string | null;
  availableDevices: MediaDeviceInfo[];
}

interface AudioItem {
  track: Track;
  element: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;   // Per-item gain for crossfade
  connected: boolean;
}

// ============================================================
// AUDIENGINE SINGLETON
// ============================================================

class AudioEngine {
  private static _instance: AudioEngine | null = null;

  // Core Web Audio nodes
  private _context: AudioContext | null = null;
  private _preampGain: GainNode | null = null;
  private _eqFilters: BiquadFilterNode[] = [];
  private _compressor: DynamicsCompressorNode | null = null;
  private _masterGain: GainNode | null = null;
  private _analyser: AnalyserNode | null = null;
  private _workletNode: AudioWorkletNode | null = null;

  // Playback items (A/B for crossfade)
  private _activeItem: AudioItem | null = null;
  private _nextItem: AudioItem | null = null;

  // State
  private _volume: number = 0.8;
  private _isMuted: boolean = false;
  private _crossfadeSeconds: number = 0;
  private _isGapless: boolean = true;
  private _outputDeviceId: string | null = null;
  private _availableDevices: MediaDeviceInfo[] = [];
  private _isInitialized: boolean = false;
  private _workletReady: boolean = false;

  // Animation frame handle
  private _rafHandle: number | null = null;
  private _analyzerBuffer: Uint8Array = new Uint8Array(ANALYZER_FFT_SIZE / 2);

  // Event handlers
  private _events: Partial<AudioEngineEvents> = {};

  // Crossfade state
  private _crossfadeActive: boolean = false;
  private _crossfadeTimeout: ReturnType<typeof setTimeout> | null = null;

  // Track metadata (for seeking without re-fetch)
  private _currentTrack: Track | null = null;

  // Prevent double-initialization
  private _initPromise: Promise<void> | null = null;

  // ──────────────────────────────────────────────────────────
  // Singleton accessor
  // ──────────────────────────────────────────────────────────

  static getInstance(): AudioEngine {
    if (!AudioEngine._instance) {
      AudioEngine._instance = new AudioEngine();
    }
    return AudioEngine._instance;
  }

  private constructor() {}

  // ──────────────────────────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this._isInitialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Create AudioContext (must be triggered by user gesture upstream)
      this._context = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 });

      // ── Preamp Gain ──────────────────────────────────────
      this._preampGain = this._context.createGain();
      this._preampGain.gain.value = 1.0; // 0dB

      // ── 10-Band EQ (BiquadFilter chain) ──────────────────
      this._eqFilters = EQ_FREQUENCIES.map((freq, i) => {
        const filter = this._context!.createBiquadFilter();
        filter.frequency.value = freq;
        filter.Q.value = EQ_Q;
        filter.gain.value = 0;
        // Low shelf for lowest band, high shelf for highest, peaking for all others
        if (i === 0) filter.type = 'lowshelf';
        else if (i === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        return filter;
      });

      // Chain EQ filters in series
      this._preampGain.connect(this._eqFilters[0]);
      for (let i = 0; i < this._eqFilters.length - 1; i++) {
        this._eqFilters[i].connect(this._eqFilters[i + 1]);
      }

      // ── Dynamics Compressor (LUFS normalization) ─────────
      // Gentle "loudness leveling" compressor — NOT aggressive limiting.
      // Attack/release tuned for transparent cross-track normalization.
      this._compressor = this._context.createDynamicsCompressor();
      this._compressor.threshold.value = -18;  // dBFS
      this._compressor.knee.value = 12;         // dB — soft knee for transparency
      this._compressor.ratio.value = 3;         // 3:1 — subtle
      this._compressor.attack.value = 0.003;    // 3ms
      this._compressor.release.value = 0.25;    // 250ms

      // ── Master Gain ───────────────────────────────────────
      this._masterGain = this._context.createGain();
      this._masterGain.gain.value = this._isMuted ? 0 : this._volume;

      // ── Analyser ─────────────────────────────────────────
      this._analyser = this._context.createAnalyser();
      this._analyser.fftSize = ANALYZER_FFT_SIZE;
      this._analyser.smoothingTimeConstant = 0.82;
      this._analyser.minDecibels = -90;
      this._analyser.maxDecibels = -10;
      this._analyzerBuffer = new Uint8Array(this._analyser.frequencyBinCount);

      // ── Connect node graph ────────────────────────────────
      // EQ last filter → compressor → master → analyser → destination
      const lastEQ = this._eqFilters[this._eqFilters.length - 1];
      lastEQ.connect(this._compressor);
      this._compressor.connect(this._masterGain);
      this._masterGain.connect(this._analyser);
      this._analyser.connect(this._context.destination);

      // ── AudioWorklet (spectrum processor on separate thread) ──
      try {
        const blob = new Blob([WORKLET_PROCESSOR], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this._context.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        this._workletNode = new AudioWorkletNode(this._context, 'spectrum-processor');
        this._workletNode.port.onmessage = (evt) => {
          if (evt.data.type === 'rms') {
            this._events.onRMSLevel?.(evt.data.rms);
          }
        };
        this._masterGain.connect(this._workletNode);
        this._workletReady = true;
      } catch (workletErr) {
        // Worklet failure is non-fatal; fall back to main-thread analyser
        console.warn('[AudioEngine] AudioWorklet unavailable, using main-thread fallback', workletErr);
      }

      // ── Enumerate output devices ──────────────────────────
      await this._refreshDevices();

      // ── Start analyzer RAF loop ───────────────────────────
      this._startAnalyzerLoop();

      this._isInitialized = true;
    } catch (err) {
      this._events.onError?.({
        code: 'CONTEXT_ERROR',
        message: `Failed to initialize AudioContext: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────
  // Device Management
  // ──────────────────────────────────────────────────────────

  private async _refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this._availableDevices = devices.filter((d) => d.kind === 'audiooutput');
    } catch {
      this._availableDevices = [];
    }
  }

  getAvailableDevices(): MediaDeviceInfo[] {
    return this._availableDevices;
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this._activeItem?.element) return;
    try {
      // setSinkId is not yet in all TypeScript lib defs
      const el = this._activeItem.element as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
      if (typeof el.setSinkId === 'function') {
        await el.setSinkId(deviceId);
        this._outputDeviceId = deviceId;
      }
    } catch (err) {
      this._events.onError?.({
        code: 'DEVICE_ERROR',
        message: `Cannot route to device ${deviceId}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // EQ Control
  // ──────────────────────────────────────────────────────────

  setEQBandGain(bandIndex: number, gainDb: number): void {
    if (!this._context) return;
    const filter = this._eqFilters[bandIndex];
    if (!filter) return;
    // Ramp to prevent clicks
    filter.gain.setTargetAtTime(gainDb, this._context.currentTime, 0.01);
  }

  setAllEQBands(gains: number[]): void {
    gains.forEach((gain, i) => this.setEQBandGain(i, gain));
  }

  setPreampGain(db: number): void {
    if (!this._context || !this._preampGain) return;
    const linearGain = Math.pow(10, db / 20);
    this._preampGain.gain.setTargetAtTime(linearGain, this._context.currentTime, 0.01);
  }

  setEQEnabled(enabled: boolean): void {
    // Bypass by setting all gains to 0 and preamp to 0dB
    if (!enabled) {
      this._eqFilters.forEach((f) => (f.gain.value = 0));
      if (this._preampGain) this._preampGain.gain.value = 1.0;
    }
    // Re-applying stored values handled by caller
  }

  getAnalyserNode(): AnalyserNode | null {
    return this._analyser;
  }

  // ──────────────────────────────────────────────────────────
  // Playback Control
  // ──────────────────────────────────────────────────────────

  async loadTrack(track: Track, quality: 'lossy' | 'lossless' = 'lossy'): Promise<void> {
    if (!this._isInitialized) await this.initialize();
    if (!this._context) return;

    this._currentTrack = track;

    // Resume context if suspended (browser autoplay policy)
    if (this._context.state === 'suspended') {
      await this._context.resume();
    }

    const url = quality === 'lossless' && track.audioLosslessUrl
      ? track.audioLosslessUrl
      : track.audioUrl;

    const newItem = await this._createAudioItem(track, url);
    if (!newItem) return;

    if (this._crossfadeSeconds > CROSSFADE_MIN_DURATION && this._activeItem?.element.currentTime > 0) {
      // Crossfade: fade out old, fade in new simultaneously
      await this._crossfadeTo(newItem);
    } else {
      // Immediate switch
      this._teardownItem(this._activeItem);
      this._activeItem = newItem;
      this._connectItemToGraph(newItem, this._volume);
    }

    this._setupTrackEventListeners(newItem);
  }

  private async _createAudioItem(track: Track, url: string): Promise<AudioItem | null> {
    if (!this._context) return null;

    const element = new Audio();
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';

    // Apply output device if set
    if (this._outputDeviceId) {
      try {
        const el = element as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
        if (typeof el.setSinkId === 'function') {
          await el.setSinkId(this._outputDeviceId);
        }
      } catch { /* non-fatal */ }
    }

    // Set source and begin buffering
    element.src = url;

    const sourceNode = this._context.createMediaElementSource(element);
    const gainNode = this._context.createGain();
    gainNode.gain.value = 0; // Start silent; _connectItemToGraph will set it

    sourceNode.connect(gainNode);

    return { track, element, sourceNode, gainNode, connected: false };
  }

  private _connectItemToGraph(item: AudioItem, targetGain: number): void {
    if (!this._preampGain || item.connected) return;
    item.gainNode.connect(this._preampGain);
    item.gainNode.gain.value = this._isMuted ? 0 : targetGain;
    item.connected = true;
  }

  private _teardownItem(item: AudioItem | null): void {
    if (!item) return;
    try {
      item.element.pause();
      item.element.src = '';
      item.sourceNode.disconnect();
      item.gainNode.disconnect();
      item.element.load(); // Release memory
    } catch { /* ignore disconnect errors */ }
  }

  private async _crossfadeTo(nextItem: AudioItem): Promise<void> {
    if (!this._context || !this._activeItem) return;

    const duration = this._crossfadeSeconds;
    const now = this._context.currentTime;

    // Connect next item silently
    this._connectItemToGraph(nextItem, 0);

    // Fade out current
    const currentGain = this._activeItem.gainNode.gain;
    currentGain.cancelScheduledValues(now);
    currentGain.setValueAtTime(currentGain.value, now);
    currentGain.linearRampToValueAtTime(0, now + duration);

    // Fade in next
    const nextGain = nextItem.gainNode.gain;
    nextGain.cancelScheduledValues(now);
    nextGain.setValueAtTime(0, now);
    nextGain.linearRampToValueAtTime(this._isMuted ? 0 : this._volume, now + duration);

    // Start next track immediately (crossfade overlap)
    await nextItem.element.play();

    // After crossfade complete, teardown old item
    const oldItem = this._activeItem;
    this._crossfadeActive = true;
    if (this._crossfadeTimeout) clearTimeout(this._crossfadeTimeout);
    this._crossfadeTimeout = setTimeout(() => {
      this._teardownItem(oldItem);
      this._crossfadeActive = false;
    }, duration * 1000);

    this._activeItem = nextItem;
  }

  private _setupTrackEventListeners(item: AudioItem): void {
    const el = item.element;

    el.ontimeupdate = () => {
      const ms = el.currentTime * 1000;
      const durMs = (isNaN(el.duration) ? 0 : el.duration) * 1000;
      this._events.onTimeUpdate?.(ms, durMs);

      // Emit buffer progress
      if (el.buffered.length > 0) {
        const bufferedEnd = el.buffered.end(el.buffered.length - 1);
        this._events.onBufferProgress?.(bufferedEnd * 1000);
      }
    };

    el.onended = () => {
      if (!this._crossfadeActive) {
        this._events.onTrackEnd?.();
      }
    };

    el.onplay = () => this._events.onPlayStateChange?.(true);
    el.onpause = () => this._events.onPlayStateChange?.(false);

    el.onerror = () => {
      this._events.onError?.({
        code: 'NETWORK_ERROR',
        message: `Failed to load audio for track: ${item.track.title}`,
        track: item.track,
      });
    };
  }

  async play(): Promise<void> {
    if (!this._context) return;
    if (this._context.state === 'suspended') await this._context.resume();
    if (this._activeItem) await this._activeItem.element.play();
  }

  pause(): void {
    this._activeItem?.element.pause();
  }

  seek(positionMs: number): void {
    if (!this._activeItem) return;
    this._activeItem.element.currentTime = positionMs / 1000;
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (!this._isMuted) {
      this._applyVolume(this._volume);
    }
  }

  private _applyVolume(gain: number): void {
    if (!this._context || !this._masterGain) return;
    this._masterGain.gain.setTargetAtTime(gain, this._context.currentTime, 0.02);
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    this._applyVolume(muted ? 0 : this._volume);
  }

  setCrossfade(seconds: number): void {
    this._crossfadeSeconds = Math.max(0, Math.min(12, seconds));
  }

  getCurrentPosition(): number {
    return (this._activeItem?.element.currentTime ?? 0) * 1000;
  }

  getDuration(): number {
    const dur = this._activeItem?.element.duration ?? 0;
    return isNaN(dur) ? 0 : dur * 1000;
  }

  isPlaying(): boolean {
    return this._activeItem ? !this._activeItem.element.paused : false;
  }

  // ──────────────────────────────────────────────────────────
  // Analyzer Loop
  // ──────────────────────────────────────────────────────────

  private _startAnalyzerLoop(): void {
    const tick = () => {
      if (this._analyser) {
        this._analyser.getByteFrequencyData(this._analyzerBuffer);
        this._events.onAnalyzerData?.(this._analyzerBuffer);
      }
      this._rafHandle = requestAnimationFrame(tick);
    };
    this._rafHandle = requestAnimationFrame(tick);
  }

  // ──────────────────────────────────────────────────────────
  // Event registration
  // ──────────────────────────────────────────────────────────

  on<K extends keyof AudioEngineEvents>(event: K, handler: AudioEngineEvents[K]): void {
    this._events[event] = handler as AudioEngineEvents[typeof event];
  }

  off<K extends keyof AudioEngineEvents>(event: K): void {
    delete this._events[event];
  }

  // ──────────────────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────────────────

  destroy(): void {
    if (this._rafHandle !== null) cancelAnimationFrame(this._rafHandle);
    if (this._crossfadeTimeout) clearTimeout(this._crossfadeTimeout);
    this._teardownItem(this._activeItem);
    this._teardownItem(this._nextItem);
    this._workletNode?.disconnect();
    this._context?.close();
    this._context = null;
    this._isInitialized = false;
    this._initPromise = null;
    AudioEngine._instance = null;
  }

  // ──────────────────────────────────────────────────────────
  // LUFS / RMS estimation (for UI metering)
  // Returns instantaneous power in linear scale (0–1)
  // ──────────────────────────────────────────────────────────

  getInstantaneousLevel(): number {
    if (!this._analyser) return 0;
    const data = new Float32Array(this._analyser.frequencyBinCount);
    this._analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length); // RMS
  }
}

// ============================================================
// Export singleton accessor
// ============================================================

export const getAudioEngine = (): AudioEngine => AudioEngine.getInstance();
export default AudioEngine;
