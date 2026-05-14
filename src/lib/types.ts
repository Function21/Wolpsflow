export type TrackTag =
  | "rain"
  | "forest"
  | "calm"
  | "train"
  | "space"
  | "library"
  | "city"
  | "ocean"
  | "snow"
  | "tech"
  | "focus"
  | "night"
  | string;

export type VisualLayerKind = "flow" | "orbit" | "ribbon" | "lattice" | "bloom" | "drift" | "wave";

export interface Quote {
  id: string;
  text: string;
  author: string;
}

export interface TokenMapEntry {
  tag: TrackTag;
  words: string[];
  bpm: number;
  energy: number;
  density: number;
  colors: string[];
}

export interface VisualLayer {
  kind: VisualLayerKind;
  phase: number;
  speed: number;
  amplitude: number;
  frequency: number;
  radius: number;
  twist: number;
  symmetry: number;
  colorIndex: number;
  weight: number;
  softness: number;
}

export interface VisualGenome {
  seed: number;
  layers: VisualLayer[];
  rotation: number;
  drift: number;
  complexity: number;
  symmetry: number;
  colorShift: number;
  particleScale: number;
  connectionRate: number;
  bloomRate: number;
  calmness: number;
  contrast?: "quiet" | "balanced" | "ornate";
  forms?: string[];
}

export interface Track {
  title: string;
  prompt: string;
  bpm: number;
  mode: string;
  root: string;
  energy: number;
  density: number;
  tags: TrackTag[];
  palette: string[];
  story: string[];
  seed?: number;
  quote?: Quote | null;
  visual?: VisualGenome;
  sourceTerms?: string[];
  generation?: string;
  parentTitle?: string;
}

export interface ScribbleEvent {
  note: string[] | null;
  length: number;
  level: number;
}

export interface Arrangement {
  scale: string[];
  rootMidi: number;
  progression: string[][];
  chordClip: ScribbleEvent[];
  bassClip: ScribbleEvent[];
  melodyClip: ScribbleEvent[];
  shimmerClip: ScribbleEvent[];
  guitarPattern: string;
  bassPattern: string;
  melodyPattern: string;
  shimmerPattern: string;
  progressionText: string;
  kickPattern: boolean[];
  hatPattern: boolean[];
  phraseLength: number;
  swing: number;
  airRate: number;
}

export interface MusicState {
  low: number;
  mid: number;
  high: number;
  level: number;
  density: number;
  section: number;
  climax: number;
  phrase: number;
}

export interface VisualEvent {
  id: number;
  type: "kick" | "bass" | "snare" | "hat" | "texture" | "pluck" | "metal";
  time: number;
  power?: number;
  freq?: number;
  step?: number;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  twinkle: number;
  lane: number;
  color: string;
  originX?: number;
  originY?: number;
  fromX?: number;
  fromY?: number;
  fromOriginX?: number;
  fromOriginY?: number;
  targetX?: number;
  targetY?: number;
  targetOriginX?: number;
  targetOriginY?: number;
  fromColor?: string;
  targetColor?: string;
}

export interface Ring {
  age: number;
  power: number;
  color: string;
  width: number;
}

export interface NoteSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  power: number;
  color: string;
}
