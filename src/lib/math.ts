export function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uniquePalette(colors: string[] = []): string[] {
  const fallback = ["#07090a", "#cfd8c5", "#b8c7ad", "#d8caa7", "#c9b18c", "#e7e1cf"];
  return [...new Set([...colors, ...fallback])].slice(0, 7);
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(hexA: string, hexB: string, amount: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const ratio = clamp(amount, 0, 1);
  const r = Math.round(a.r * (1 - ratio) + b.r * ratio);
  const g = Math.round(a.g * (1 - ratio) + b.g * ratio);
  const bl = Math.round(a.b * (1 - ratio) + b.b * ratio);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const rgbMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(hex.trim());
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3])
    };
  }

  const normalized = hex.replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

function toHex(value: number): string {
  return clamp(value, 0, 255).toString(16).padStart(2, "0");
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
