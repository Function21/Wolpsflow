import * as Tone from "tone";
import { clip, getChordsByProgression, scale as scribbleScale } from "scribbletune";
import type { Arrangement, MusicState, ScribbleEvent, Track, VisualEvent } from "./types";
import { NOTE_OFFSETS, PRESET_TRACKS, normalizeTrack } from "./tracks";
import { clamp, hashString, midiToFrequency, mulberry32, pick } from "./math";

// Audio configuration constants
const AUDIO_CONFIG = {
  LIMITER_THRESHOLD: -10,
  COMPRESSOR_THRESHOLD: -28,
  COMPRESSOR_RATIO: 2.1,
  COMPRESSOR_ATTACK: 0.12,
  COMPRESSOR_RELEASE: 0.48,
  MASTER_GAIN: 0.36,
  ANALYSER_SIZE: 256,
  DELAY_TIME: "8n.",
  DELAY_FEEDBACK: 0.16,
  DELAY_WET: 0.11,
  REVERB_ROOM_SIZE: 0.72,
  REVERB_DAMPENING: 4200,
  REVERB_WET: 0.18,
  GUITAR_FILTER_FREQ: 1450,
  GUITAR_FILTER_ROLLOFF: -12,
  HAT_FILTER_FREQ: 3600,
  HAT_FILTER_ROLLOFF: -24,
  GUITAR_ATTACK: 0.008,
  GUITAR_DECAY: 0.18,
  GUITAR_SUSTAIN: 0.06,
  GUITAR_RELEASE: 0.52,
  PIANO_ATTACK: 0.012,
  PIANO_DECAY: 0.24,
  PIANO_SUSTAIN: 0.08,
  PIANO_RELEASE: 1.65,
  PLUCK_ATTACK: 0.01,
  PLUCK_DECAY: 0.14,
  PLUCK_SUSTAIN: 0.03,
  PLUCK_RELEASE: 0.9,
  BASS_FILTER_FREQ: 260,
  BASS_FILTER_Q: 0.45,
  BASS_ATTACK: 0.04,
  BASS_DECAY: 0.22,
  BASS_SUSTAIN: 0.28,
  BASS_RELEASE: 1.15,
  BASS_FILTER_ENV_ATTACK: 0.05,
  BASS_FILTER_ENV_DECAY: 0.18,
  BASS_FILTER_ENV_SUSTAIN: 0.12,
  BASS_FILTER_ENV_RELEASE: 0.9,
  BASS_FILTER_ENV_BASE_FREQ: 72,
  BASS_FILTER_ENV_OCTAVES: 1.45,
  KICK_PITCH_DECAY: 0.025,
  KICK_OCTAVES: 2.4,
  KICK_ATTACK: 0.006,
  KICK_DECAY: 0.18,
  KICK_SUSTAIN: 0.01,
  KICK_RELEASE: 0.18,
  HAT_ATTACK: 0.004,
  HAT_DECAY: 0.045,
  HAT_RELEASE: 0.025,
  HAT_HARMONICITY: 2.4,
  HAT_MODULATION_INDEX: 6,
  HAT_RESONANCE: 900,
  HAT_OCTAVES: 0.35,
  RECENT_WINDOW: 2.9,
  RECENT_DENSITY_DIVISOR: 22,
  SPECTRAL_WEIGHT_LOW: 0.38,
  SPECTRAL_WEIGHT_MID: 0.36,
  SPECTRAL_WEIGHT_HIGH: 0.26,
  CLIMAX_WEIGHT_SECTION: 0.56,
  CLIMAX_WEIGHT_DENSITY: 0.25,
  CLIMAX_WEIGHT_SPECTRAL: 0.19,
  LEVEL_WEIGHT_LOW: 0.48,
  LEVEL_WEIGHT_MID: 0.32,
  LEVEL_WEIGHT_HIGH: 0.2,
  HUMANIZE_CHANCE: 0.08,
  HUMANIZE_THRESHOLD: 0.42,
  HUMANIZE_EXTENSION_HIGH: 0.78
} as const;

type RampTarget = {
  rampTo: (value: number, rampTime: number) => void;
};

function toScribbleEvents(events: Array<{ note: string[] | null; length: number; level: number }>): ScribbleEvent[] {
  return events.map((event) => ({
    note: event.note,
    length: event.length,
    level: event.level
  }));
}

function normalizeScribbleNotes(chordName: string): string[] {
  return toScribbleEvents(clip({ notes: chordName, pattern: "x", subdiv: "8n" }))[0]?.note || [];
}

function normalizeNoteName(note: string): string {
  const match = /^([A-Ga-g])([#b]?)(\d*)$/.exec(note.trim());
  if (!match) return note;
  const [, letter, accidental, octave] = match;
  return `${letter.toUpperCase()}${accidental}${octave || "4"}`;
}

function transposeNoteOctave(note: string, amount: number): string {
  return normalizeNoteName(note).replace(/(\d+)$/, (octave) => String(Number(octave) + amount));
}

function lowerNote(note: string, amount: number): string {
  return normalizeNoteName(note).replace(/(\d+)$/, (octave) => String(Math.max(1, Number(octave) - amount)));
}

function scribbleLengthToSeconds(length: number, beat: number): number {
  return Math.max(beat * 0.18, (length / 128) * beat);
}

function noteToFrequency(note: string): number {
  const match = /^([A-G])([#b]?)(\d+)$/.exec(normalizeNoteName(note));
  if (!match) return 440;
  const [, letter, accidental, octaveText] = match;
  const normalized = accidental === "b" ? FLAT_TO_SHARP[`${letter}${accidental}`] || letter : `${letter}${accidental}`;
  const offset = NOTE_OFFSETS[normalized] ?? 0;
  return midiToFrequency(12 * (Number(octaveText) + 1) + offset);
}

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#"
};
function rampParam(param: unknown, value: number, rampTime: number): void {
  if (param && typeof (param as RampTarget).rampTo === "function") {
    (param as RampTarget).rampTo(value, rampTime);
  }
}

function noteNameFromMidi(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[((midi % 12) + 12) % 12]}${octave}`;
}

function rotatePattern(pattern: string, amount: number): string {
  if (!pattern.length) return pattern;
  const shift = ((amount % pattern.length) + pattern.length) % pattern.length;
  return `${pattern.slice(shift)}${pattern.slice(0, shift)}`;
}

function humanizeBooleanPattern(pattern: boolean[], random: () => number, chance = 0.08): boolean[] {
  return pattern.map((active, index) => {
    if (index === 0) return active;
    if (random() < chance) return !active;
    return active;
  });
}

function extendScaleNotes(scale: string[], random: () => number): string[] {
  const pool = [...scale];
  for (const note of scale) {
    if (random() > 0.42) pool.push(transposeNoteOctave(note, 1));
    if (random() > 0.78) pool.push(transposeNoteOctave(note, -1));
  }
  return pool;
}

function createFallbackArrangement(track: Track): Arrangement {
  const random = mulberry32((track.seed || 1) ^ 0x6d1f2b41);
  const tags = track.tags || [];
  const rootName = track.root || "C";
  const rootMidi = 48 + (NOTE_OFFSETS[rootName] ?? 0);
  const minor = tags.includes("rain") || tags.includes("space") || tags.includes("night") || tags.includes("snow");
  const scaleSteps = minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
  const scale = scaleSteps.map((step) => noteNameFromMidi(rootMidi + step));
  const chordDegrees = minor ? [0, 5, 3, 4] : [0, 4, 5, 3];
  const progression = chordDegrees.map((degree) => {
    const base = rootMidi + scaleSteps[degree % scaleSteps.length];
    const third = rootMidi + scaleSteps[(degree + 2) % scaleSteps.length] + (degree + 2 >= scaleSteps.length ? 12 : 0);
    const fifth = rootMidi + scaleSteps[(degree + 4) % scaleSteps.length] + (degree + 4 >= scaleSteps.length ? 12 : 0);
    return [noteNameFromMidi(base), noteNameFromMidi(third), noteNameFromMidi(fifth)];
  });
  const quiet = track.density < 0.38;

  return {
    scale,
    rootMidi,
    progression,
    chordClip: progression.flatMap((chord) => [
      { note: chord, length: 34, level: 58 },
      { note: null, length: 64, level: 0 },
      { note: quiet ? null : chord.slice(0, 2), length: quiet ? 64 : 28, level: quiet ? 0 : 46 },
      { note: null, length: 64, level: 0 }
    ]),
    bassClip: progression.flatMap((chord) => [
      { note: [lowerNote(chord[0], 1)], length: 80, level: 68 },
      { note: null, length: 48, level: 0 },
      { note: quiet ? null : [lowerNote(chord[1] || chord[0], 2)], length: 64, level: quiet ? 0 : 54 },
      { note: null, length: 64, level: 0 }
    ]),
    melodyClip: Array.from({ length: 16 }, (_, index) => {
      const active = index % 4 === 0 || (!quiet && (index + Math.floor(random() * 3)) % 5 === 0);
      const note = transposeNoteOctave(scale[Math.floor(random() * scale.length)] || `${rootName}4`, index % 7 === 0 ? 1 : 0);
      return { note: active ? [note] : null, length: 64, level: active ? 62 + Math.floor(random() * 22) : 0 };
    }),
    shimmerClip: Array.from({ length: 16 }, (_, index) => {
      const active = index % 8 === 6 || (!quiet && index % 8 === 3);
      const note = transposeNoteOctave(scale[(index + 4) % scale.length] || `${rootName}4`, 2);
      return { note: active ? [note] : null, length: 42, level: active ? 48 + Math.floor(random() * 18) : 0 };
    }),
    guitarPattern: "x---x-------x---",
    bassPattern: quiet ? "x-------x-------" : "x-------x---x---",
    melodyPattern: "x---x-----x---x-",
    shimmerPattern: "--------x-------",
    progressionText: minor ? "i VI iv v" : "I V vi IV",
    kickPattern: Array.from({ length: 16 }, (_, index) => index === 0 || index === 10 || (!quiet && index === 7)),
    hatPattern: Array.from({ length: 16 }, (_, index) => index % 4 === 2 || (!quiet && index % 8 === 7)),
    phraseLength: clamp(24 + Math.floor(random() * 8), 22, 34),
    swing: 0.012 + random() * 0.026,
    airRate: 0
  };
}

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  transport: ReturnType<typeof Tone.getTransport> | null = null;
  master: Tone.Gain | null = null;
  limiter: Tone.Limiter | null = null;
  compressor: Tone.Compressor | null = null;
  analyser: Tone.Analyser | null = null;
  guitar: Tone.PolySynth<Tone.Synth> | null = null;
  piano: Tone.PolySynth<Tone.Synth> | null = null;
  pluck: Tone.PolySynth<Tone.Synth> | null = null;
  bass: Tone.MonoSynth | null = null;
  kick: Tone.MembraneSynth | null = null;
  hat: Tone.MetalSynth | null = null;
  delay: Tone.FeedbackDelay | null = null;
  reverb: Tone.Freeverb | null = null;
  guitarFilter: Tone.Filter | null = null;
  hatFilter: Tone.Filter | null = null;
  track = normalizeTrack(PRESET_TRACKS[0]);
  arrangement = this.safeCreateArrangement(this.track);
  isPlaying = false;
  toneReady = false;
  step = 0;
  loopCount = 1;
  stepEventId: number | null = null;
  musicState: MusicState = { low: 0, mid: 0, high: 0, level: 0, density: 0, section: 0, climax: 0, phrase: 0 };
  visualEvents: VisualEvent[] = [];
  visualEventId = 0;
  startedAt = 0;
  recentEventTimes: number[] = [];

  async init(): Promise<void> {
    if (this.toneReady) return;

    await Tone.start();
    this.ctx = Tone.getContext().rawContext;
    this.transport = Tone.getTransport();
    this.transport.bpm.value = this.track.bpm;

    this.limiter = new Tone.Limiter(AUDIO_CONFIG.LIMITER_THRESHOLD).toDestination();
    this.compressor = new Tone.Compressor({
      threshold: AUDIO_CONFIG.COMPRESSOR_THRESHOLD,
      ratio: AUDIO_CONFIG.COMPRESSOR_RATIO,
      attack: AUDIO_CONFIG.COMPRESSOR_ATTACK,
      release: AUDIO_CONFIG.COMPRESSOR_RELEASE
    }).connect(this.limiter);
    this.master = new Tone.Gain(AUDIO_CONFIG.MASTER_GAIN).connect(this.compressor);
    this.analyser = new Tone.Analyser("fft", AUDIO_CONFIG.ANALYSER_SIZE);
    this.master.connect(this.analyser);

    this.delay = new Tone.FeedbackDelay({
      delayTime: AUDIO_CONFIG.DELAY_TIME,
      feedback: AUDIO_CONFIG.DELAY_FEEDBACK,
      wet: AUDIO_CONFIG.DELAY_WET
    }).connect(this.master);
    this.reverb = new Tone.Freeverb({
      roomSize: AUDIO_CONFIG.REVERB_ROOM_SIZE,
      dampening: AUDIO_CONFIG.REVERB_DAMPENING,
      wet: AUDIO_CONFIG.REVERB_WET
    }).connect(this.master);
    this.guitarFilter = new Tone.Filter({
      type: "lowpass",
      frequency: AUDIO_CONFIG.GUITAR_FILTER_FREQ,
      rolloff: AUDIO_CONFIG.GUITAR_FILTER_ROLLOFF
    }).connect(this.reverb);
    this.guitarFilter.connect(this.master);
    this.hatFilter = new Tone.Filter({
      type: "lowpass",
      frequency: AUDIO_CONFIG.HAT_FILTER_FREQ,
      rolloff: AUDIO_CONFIG.HAT_FILTER_ROLLOFF
    }).connect(this.master);

    this.guitar = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: AUDIO_CONFIG.GUITAR_ATTACK,
        decay: AUDIO_CONFIG.GUITAR_DECAY,
        sustain: AUDIO_CONFIG.GUITAR_SUSTAIN,
        release: AUDIO_CONFIG.GUITAR_RELEASE
      }
    }).connect(this.guitarFilter);

    this.piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle8" },
      envelope: { attack: 0.012, decay: 0.24, sustain: 0.08, release: 1.65 }
    }).connect(this.master);
    this.piano.connect(this.delay);

    this.pluck = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.14, sustain: 0.03, release: 0.9 }
    }).connect(this.master);
    this.pluck.connect(this.delay);

    this.bass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      filter: { type: "lowpass", frequency: 260, Q: 0.45 },
      envelope: { attack: 0.04, decay: 0.22, sustain: 0.28, release: 1.15 },
      filterEnvelope: { attack: 0.05, decay: 0.18, sustain: 0.12, release: 0.9, baseFrequency: 72, octaves: 1.45 }
    }).connect(this.master);

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.025,
      octaves: 2.4,
      oscillator: { type: "sine" },
      envelope: { attack: 0.006, decay: 0.18, sustain: 0.01, release: 0.18 }
    }).connect(this.master);

    this.hat = new Tone.MetalSynth({
      envelope: { attack: 0.004, decay: 0.045, release: 0.025 },
      harmonicity: 2.4,
      modulationIndex: 6,
      resonance: 900,
      octaves: 0.35
    }).connect(this.hatFilter);

    this.updateTonePatch();
    this.createLoop();
    this.toneReady = true;
  }

  createLoop(): void {
    if (!this.transport || this.stepEventId !== null) return;
    this.stepEventId = this.transport.scheduleRepeat((time: number) => {
      this.scheduleStep(this.step, time);
      this.step = (this.step + 1) % 64;
      if (this.step === 0) this.loopCount += 1;
    }, "16n");
  }

  setTrack(track: Track): void {
    this.track = normalizeTrack(track);
    this.arrangement = this.safeCreateArrangement(this.track);
    this.step = 0;
    this.loopCount = 1;
    this.startedAt = this.now();
    this.recentEventTimes = [];
    this.visualEvents = [];

    if (this.transport) {
      this.transport.bpm.rampTo(this.track.bpm, 0.35);
      this.updateTonePatch();
    }
  }

  setVolume(value: number): void {
    if (!this.master) return;
    this.master.gain.rampTo(clamp(value, 0, 0.72), 0.18);
  }

  play(): void {
    if (!this.transport) return;
    void Tone.start();
    this.transport.bpm.rampTo(this.track.bpm, 0.12);
    if (this.transport.state !== "started") {
      this.transport.start("+0.05");
      this.startedAt = this.now();
    }
    this.isPlaying = true;
  }

  pause(): void {
    if (!this.transport) return;
    this.isPlaying = false;
    this.transport.pause();
  }

  now(): number {
    return Tone.now();
  }

  safeCreateArrangement(track: Track): Arrangement {
    try {
      return this.createArrangement(track);
    } catch (error) {
      console.error("Wolpsflow arrangement fallback", error);
      return createFallbackArrangement(track);
    }
  }

  createArrangement(track: Track): Arrangement {
    const random = mulberry32((track.seed || 1) ^ 0xa511e9b3);
    const tags = track.tags || [];
    const mode = tags.includes("rain") || tags.includes("space") || tags.includes("night") || tags.includes("snow")
      ? "minor"
      : "major";
    const rootName = track.root || "C";
    const rootMidi = 36 + NOTE_OFFSETS[rootName] + (tags.includes("space") ? 12 : 0);
    const scale = scribbleScale(`${rootName}4 ${mode}`);
    const progressions = mode === "minor"
      ? [
          "i VI iv v",
          "i iv VII III",
          "i VI III VII",
          "i VII VI v",
          "i iv VI v",
          "i III VII VI",
          "i v VI iv",
          "i VII III VI",
          "i VI v VII",
          "i iv VI III",
          "i v iv VI",
          "i III VI VII",
          "i VII iv VI",
          "i VI VII v",
          "i iv III VII",
          "i v VII VI"
        ]
      : [
          "I V vi IV",
          "I IV vi V",
          "I iii IV V",
          "I vi IV V",
          "I V ii IV",
          "vi IV I V",
          "I ii V IV",
          "I iii vi IV",
          "I IV ii V",
          "vi V IV I",
          "I V IV ii",
          "I vi ii V",
          "I IV V vi",
          "vi ii IV V",
          "I iii ii V",
          "I V iii IV"
        ];
    const progressionText = pick(progressions, random);
    const chordNames = getChordsByProgression(`${rootName}4 ${mode}`, progressionText).split(/\s+/);
    const progression = chordNames.map((chordName) => normalizeScribbleNotes(chordName));
    const notePool = extendScaleNotes(scale, random);
    const scaleNotes = notePool.join(" ");
    const bassNotes = progression.map((chord) => chord[0] || `${rootName}3`).join(" ");
    const melodicMotion = track.seed ? track.seed % 5 : 0;
    const rotate = Math.floor(random() * 16);
    const guitarPatterns = [
      "x---x-------x---",
      "x-----x---x-----",
      "--x---x-----x---",
      "x-------x---x---",
      "x---x---x-------",
      "--x-----x---x---",
      "x-----x-----x---",
      "---x--x-----x---",
      "x---x-----x-----",
      "--x---x---x-----",
      "x------x----x---",
      "x---x-------x-x-",
      "x-----x---x---x-",
      "---x----x---x---",
      "x---x---x---x---",
      "--x-----x-----x-"
    ].map((pattern, index) => rotatePattern(pattern, rotate + index));
    const bassPatterns = [
      "x-------x---x---",
      "x---------x-----",
      "x---x-------x---",
      "x-------x-------",
      "x-----x---x-----",
      "x----------x----",
      "x---x-----x-----",
      "x-------x-----x-",
      "x-----x-------x-",
      "x---------x---x-",
      "x---x---------x-",
      "x------x----x---"
    ].map((pattern, index) => rotatePattern(pattern, Math.floor(rotate / 2) + index));
    const melodyPatterns = [
      "x---x-----x---x-",
      "--x-----x---x---",
      "x------x--x-----",
      "---x-----x---x--",
      "x-----x------x--",
      "----x---x------x",
      "x-----x---x-----",
      "--x---x------x--",
      "x--------x---x--",
      "---x---x-----x--",
      "x---x--------x--",
      "----x-----x---x-",
      "--x------x-----x",
      "x--x------x-----",
      "-----x---x---x--",
      "--x---x----x----",
      "x-------x--x----",
      "---x------x--x--",
      "x----x-------x--",
      "----x--x------x-",
      "--x------x---x--",
      "x-----x-----x---",
      "---x----x-----x-",
      "x---x------x----",
      "-----x---x-----x"
    ].map((pattern, index) => rotatePattern(pattern, rotate + index * 3));
    const shimmerPatterns = [
      "--------x-------",
      "------x---------",
      "----x---------x-",
      "----------x-----",
      "-----x-------x--",
      "---x---------x--",
      "-------x------x-",
      "----x------x----",
      "---------x----x-",
      "--x----------x--",
      "------x----x----",
      "-----------x--x-"
    ].map((pattern, index) => rotatePattern(pattern, rotate + index * 5));
    const kickPatterns = [
      [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      [true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false],
      [true, false, false, false, false, false, false, true, false, false, true, false, false, false, false, false],
      [true, false, false, false, false, false, false, false, false, false, true, false, false, false, true, false],
      [true, false, false, false, true, false, false, false, false, false, true, false, false, false, false, false],
      [true, false, false, false, false, false, false, false, true, false, false, true, false, false, false, false],
      [true, false, false, false, false, true, false, false, false, false, true, false, false, false, false, false],
      [true, false, false, false, false, false, false, true, false, false, false, false, true, false, false, false],
      [true, false, false, false, false, false, true, false, false, false, false, false, false, false, true, false],
      [true, false, false, false, false, false, false, false, false, true, false, false, true, false, false, false],
      [true, false, false, false, false, false, false, false, true, false, false, false, false, true, false, false],
      [true, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false]
    ];
    const hatPatterns = [
      [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      [false, false, true, false, false, false, false, true, false, false, true, false, false, true, false, false],
      [false, false, false, true, false, false, true, false, false, false, false, true, false, false, true, false],
      [false, false, true, false, false, true, false, false, false, false, true, false, false, false, false, true],
      [false, true, false, false, false, false, true, false, false, true, false, false, false, false, true, false],
      [false, false, false, true, false, true, false, false, false, false, true, false, false, true, false, false],
      [false, false, true, false, false, false, false, false, false, false, true, false, false, false, false, true],
      [false, false, true, false, false, true, false, false, false, false, false, true, false, false, true, false],
      [false, false, false, true, false, false, true, false, false, true, false, false, false, false, true, false],
      [false, true, false, false, false, false, false, true, false, false, true, false, false, true, false, false],
      [false, false, true, false, false, false, true, false, false, false, false, true, false, true, false, false],
      [false, false, false, true, false, true, false, false, false, false, true, false, false, false, true, false]
    ];
    const guitarPattern = pick(guitarPatterns, random);
    const bassPattern = pick(bassPatterns, random);
    const melodyPattern = pick(melodyPatterns, random);
    const shimmerPattern = pick(shimmerPatterns, random);

    return {
      scale,
      rootMidi,
      progression,
      chordClip: toScribbleEvents(clip({
        notes: chordNames.join(" "),
        pattern: guitarPattern,
        subdiv: "8n",
        amp: 36 + Math.floor(random() * 14),
        accent: "x--x",
        accentLow: 20 + Math.floor(random() * 12)
      })),
      bassClip: toScribbleEvents(clip({
        notes: bassNotes,
        pattern: tags.includes("train") ? rotatePattern(pick(bassPatterns, random), 2) : bassPattern,
        subdiv: "8n",
        amp: 44 + Math.floor(random() * 16),
        accent: "x-x-",
        accentLow: 28 + Math.floor(random() * 10)
      })),
      melodyClip: toScribbleEvents(clip({
        notes: scaleNotes,
        randomNotes: scaleNotes,
        pattern: melodyPatterns[(melodyPatterns.indexOf(melodyPattern) + melodicMotion) % melodyPatterns.length],
        subdiv: "8n",
        amp: 42 + Math.floor(random() * 16),
        accent: "x--x-x--",
        accentLow: 20 + Math.floor(random() * 12),
        sizzle: "sin",
        sizzleReps: 1
      })),
      shimmerClip: toScribbleEvents(clip({
        notes: scale.map((note, index) => transposeNoteOctave(note, index % 3 === 0 ? 2 : 1)).join(" "),
        randomNotes: scale.map((note) => transposeNoteOctave(note, 2)).join(" "),
        pattern: shimmerPattern,
        subdiv: "16n",
        amp: 24 + Math.floor(random() * 14),
        accent: "x---x---",
        accentLow: 14 + Math.floor(random() * 8),
        sizzle: "sin",
        sizzleReps: 1
      })),
      guitarPattern,
      bassPattern,
      melodyPattern,
      shimmerPattern,
      progressionText,
      kickPattern: humanizeBooleanPattern(pick(kickPatterns, random), random, 0.06),
      hatPattern: humanizeBooleanPattern(pick(hatPatterns, random), random, 0.1),
      phraseLength: clamp(22 + Math.floor(random() * 12), 22, 34),
      swing: 0.028 + random() * 0.055,
      airRate: 0
    };
  }
  updateTonePatch(): void {
    if (!this.guitarFilter || !this.hatFilter) return;
    const tags = this.track.tags || [];
    const brightness = 1050 + this.track.energy * 900 + this.track.density * 220;
    this.guitarFilter.frequency.rampTo(brightness, 0.55);
    this.hatFilter.frequency.rampTo(tags.includes("rain") ? 3200 : tags.includes("ocean") ? 2600 : 3000, 0.9);
    rampParam(this.delay?.feedback, tags.includes("train") ? 0.18 : 0.12 + this.track.density * 0.05, 0.9);
    rampParam(this.reverb?.roomSize, tags.includes("space") ? 0.78 : 0.58 + this.track.energy * 0.14, 0.9);
    rampParam(this.reverb?.dampening, tags.includes("forest") ? 3600 : 4300, 0.9);
  }

  scheduleStep(step: number, time: number): void {
    if (!this.guitar || !this.piano || !this.pluck || !this.bass || !this.kick || !this.hat || !this.arrangement) return;
    const random = mulberry32(hashString(`${this.track.seed}-${this.loopCount}-${step}`));
    const beat = 60 / this.track.bpm;
    const phraseState = this.getPhraseState(time);
    const lift = clamp(phraseState.section * 0.75 + this.track.energy * 0.18, 0, 1);
    const swing = step % 2 === 1 ? this.arrangement.swing * (0.55 + this.track.density * 0.35) : 0;
    const when = time + swing;

    this.playScribbleEvent("chord", this.arrangement.chordClip, step, when, beat, lift);
    this.playScribbleEvent("bass", this.arrangement.bassClip, step, when, beat, lift);
    this.playScribbleEvent("melody", this.arrangement.melodyClip, step, when + random() * 0.026, beat, lift);

    if (phraseState.section > 0.38 || this.track.density > 0.44) {
      this.playScribbleEvent("shimmer", this.arrangement.shimmerClip, step, when + random() * 0.05, beat, lift);
    }

    if (this.arrangement.kickPattern[step % this.arrangement.kickPattern.length]) {
      this.kick.triggerAttackRelease("C1", "16n", when, 0.08 + lift * 0.025);
      this.emitVisualEvent("bass", when, { power: 0.12 + lift * 0.12, step });
    }

    if (this.arrangement.hatPattern[step % this.arrangement.hatPattern.length] && random() > 0.16) {
      this.hat.triggerAttackRelease("32n", when + random() * 0.012, 0.018 + this.track.density * 0.012 + lift * 0.006);
      this.emitVisualEvent("texture", when, { power: 0.025 + lift * 0.035, step });
    }
  }

  playScribbleEvent(part: "chord" | "bass" | "melody" | "shimmer", clipEvents: ScribbleEvent[], step: number, time: number, beat: number, lift: number): void {
    const event = clipEvents[step % clipEvents.length];
    if (!event?.note?.length) return;
    const velocity = clamp((event.level || 80) / 127, 0.12, 1);
    const duration = scribbleLengthToSeconds(event.length, beat);

    if (part === "chord" && this.guitar) {
      this.guitar.triggerAttackRelease(event.note, Math.min(Math.max(duration, beat * 0.22), beat * 0.58), time, 0.028 + velocity * 0.045 + lift * 0.01);
      this.emitVisualEvent("pluck", time, { power: 0.055 + velocity * 0.055 + lift * 0.06, step });
      return;
    }

    if (part === "bass" && this.bass) {
      const note = lowerNote(event.note[0], 1);
      this.bass.triggerAttackRelease(note, Math.max(duration, beat * 0.72), time, 0.045 + velocity * 0.075 + lift * 0.025);
      this.emitVisualEvent("bass", time, { power: 0.09 + velocity * 0.09 + lift * 0.1, freq: noteToFrequency(note), step });
      return;
    }

    if (part === "melody" && this.piano) {
      this.piano.triggerAttackRelease(event.note, Math.max(duration, beat * 0.62), time, 0.024 + velocity * 0.055 + lift * 0.014);
      this.emitVisualEvent("pluck", time, { power: 0.055 + velocity * 0.075 + lift * 0.06, freq: noteToFrequency(event.note[0]), step });
      return;
    }

    if (part === "shimmer" && this.pluck) {
      this.pluck.triggerAttackRelease(event.note, Math.max(duration, beat * 0.24), time, 0.008 + velocity * 0.022 + lift * 0.008);
      this.emitVisualEvent("texture", time, { power: 0.03 + velocity * 0.035 + lift * 0.032, freq: noteToFrequency(event.note[0]), step });
    }
  }
  getPhraseState(time = this.now()): { phrase: number; section: number } {
    const phraseLength = this.arrangement?.phraseLength || 28;
    const elapsed = Math.max(0, time - this.startedAt);
    const phrase = (elapsed % phraseLength) / phraseLength;
    const section =
      phrase < 0.14 ? phrase / 0.14 * 0.24 :
      phrase < 0.52 ? 0.24 + ((phrase - 0.14) / 0.38) * 0.34 :
      phrase < 0.8 ? 0.58 + Math.sin(((phrase - 0.52) / 0.28) * Math.PI) * 0.42 :
      0.32 * (1 - (phrase - 0.8) / 0.2);
    return { phrase, section: clamp(section, 0, 1) };
  }

  emitVisualEvent(type: VisualEvent["type"], time: number, payload: Partial<VisualEvent> = {}): void {
    this.recentEventTimes.push(time);
    if (this.recentEventTimes.length > 96) this.recentEventTimes.splice(0, this.recentEventTimes.length - 96);

    this.visualEvents.push({
      id: this.visualEventId,
      type,
      time,
      ...payload
    });
    this.visualEventId = (this.visualEventId + 1) % 100000;
    if (this.visualEvents.length > 180) this.visualEvents.splice(0, this.visualEvents.length - 180);
  }

  consumeVisualEvents(now: number): VisualEvent[] {
    if (!this.visualEvents.length) return [];
    const due: VisualEvent[] = [];
    const pending: VisualEvent[] = [];

    for (const event of this.visualEvents) {
      if (event.time <= now + 0.03) due.push(event);
      else pending.push(event);
    }

    this.visualEvents = pending.slice(-140);
    return due;
  }

  getAnalysis(): MusicState {
    const now = this.now();
    const phraseState = this.getPhraseState(now);
    let low = 0;
    let mid = 0;
    let high = 0;

    if (this.analyser) {
      const values = Array.from(this.analyser.getValue() as Float32Array | number[]);
      const third = Math.max(1, Math.floor(values.length / 3));
      low = this.averageFft(values, 0, third);
      mid = this.averageFft(values, third, third * 2);
      high = this.averageFft(values, third * 2, values.length);
    }

    const recentWindow = now - AUDIO_CONFIG.RECENT_WINDOW;
    this.recentEventTimes = this.recentEventTimes.filter((eventTime) => eventTime >= recentWindow);
    const density = clamp(this.recentEventTimes.length / AUDIO_CONFIG.RECENT_DENSITY_DIVISOR, 0, 1);
    const spectral = clamp(
      low * AUDIO_CONFIG.SPECTRAL_WEIGHT_LOW +
      mid * AUDIO_CONFIG.SPECTRAL_WEIGHT_MID +
      high * AUDIO_CONFIG.SPECTRAL_WEIGHT_HIGH,
      0,
      1
    );
    const climax = clamp(
      phraseState.section * AUDIO_CONFIG.CLIMAX_WEIGHT_SECTION +
      density * AUDIO_CONFIG.CLIMAX_WEIGHT_DENSITY +
      spectral * AUDIO_CONFIG.CLIMAX_WEIGHT_SPECTRAL,
      0,
      1
    );

    this.musicState = {
      low,
      mid,
      high,
      level: clamp(
        low * AUDIO_CONFIG.LEVEL_WEIGHT_LOW +
        mid * AUDIO_CONFIG.LEVEL_WEIGHT_MID +
        high * AUDIO_CONFIG.LEVEL_WEIGHT_HIGH,
        0,
        1
      ),
      density,
      section: phraseState.section,
      climax,
      phrase: phraseState.phrase
    };
    return this.musicState;
  }

  averageFft(values: number[], start: number, end: number): number {
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) continue;
      sum += value <= 0 ? clamp((value + 96) / 96, 0, 1) : clamp(value / 255, 0, 1);
      count += 1;
    }
    return count ? sum / count : 0;
  }
}
