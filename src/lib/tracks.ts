import type { Quote, TokenMapEntry, Track, TrackTag, VisualGenome, VisualLayerKind } from "./types";
import { clamp, hashString, mulberry32, pick, uniquePalette } from "./math";

export const QUOTE_ENDPOINT = "/api/quote";
export const QUOTE_STORAGE_KEY = "wolpsflow.seenQuoteIds";

const VISUAL_LAYER_KINDS: VisualLayerKind[] = ["flow", "orbit", "ribbon", "lattice", "bloom", "drift", "wave"];

export const PRESET_TRACKS: Track[] = [
  {
    title: "Quiet Pages",
    prompt: "钢琴 弦乐 雨声 图书馆 温柔 阅读",
    bpm: 68,
    mode: "Focus",
    root: "D",
    energy: 0.28,
    density: 0.26,
    tags: ["rain", "library", "calm", "focus"],
    palette: ["#070807", "#cfd8c5", "#b8c7ad", "#d9c9a3", "#e8e3d4"],
    story: []
  },
  {
    title: "Forest Piano",
    prompt: "森林 清晨 钢琴 呼吸 专注",
    bpm: 66,
    mode: "Deep",
    root: "A",
    energy: 0.27,
    density: 0.24,
    tags: ["forest", "calm", "focus"],
    palette: ["#080b08", "#b8c7ad", "#8fa58a", "#d6c6a2", "#e7e1cf"],
    story: []
  },
  {
    title: "Warm Train",
    prompt: "夜晚 火车 轻钢琴 规律 阅读",
    bpm: 72,
    mode: "Focus",
    root: "F",
    energy: 0.31,
    density: 0.3,
    tags: ["train", "night", "calm", "focus"],
    palette: ["#080808", "#c9b18c", "#a8b3a2", "#d8cab0", "#e5ded1"],
    story: []
  },
  {
    title: "Orbit Strings",
    prompt: "星空 漂浮 冷静 数学 弦乐",
    bpm: 70,
    mode: "Clear",
    root: "C",
    energy: 0.29,
    density: 0.27,
    tags: ["space", "calm", "focus"],
    palette: ["#08090b", "#c4b9d5", "#a9b6c9", "#d8caa7", "#e7e3d8"],
    story: []
  }
];

export const TOKEN_MAP: TokenMapEntry[] = [
  { tag: "rain", words: ["雨", "雨天", "下雨", "rain"], bpm: -4, energy: -0.05, density: -0.04, colors: ["#a9b6c9", "#cfd8c5"] },
  { tag: "forest", words: ["森林", "树", "树林", "forest"], bpm: -8, energy: -0.08, density: -0.08, colors: ["#8fa58a", "#b8c7ad"] },
  { tag: "calm", words: ["宁静", "安静", "平静", "柔和", "calm", "quiet"], bpm: -12, energy: -0.14, density: -0.16, colors: ["#e7e1cf", "#d8caa7"] },
  { tag: "train", words: ["火车", "列车", "轨道", "train"], bpm: 8, energy: 0.04, density: 0.02, colors: ["#c9b18c", "#d8cab0"] },
  { tag: "space", words: ["星空", "宇宙", "轨道", "漂浮", "space"], bpm: 0, energy: -0.02, density: -0.06, colors: ["#c4b9d5", "#a9b6c9"] },
  { tag: "library", words: ["图书馆", "看书", "阅读", "书", "library", "read"], bpm: -6, energy: -0.08, density: -0.12, colors: ["#e8e3d4", "#d9c9a3"] },
  { tag: "city", words: ["城市", "霓虹", "街道", "city"], bpm: 4, energy: 0.02, density: 0, colors: ["#b9a5c8", "#a9b6c9"] },
  { tag: "ocean", words: ["海", "海岸", "浪", "ocean"], bpm: -5, energy: -0.06, density: -0.06, colors: ["#9fb6bd", "#cfd8c5"] },
  { tag: "snow", words: ["雪", "冬天", "snow"], bpm: -10, energy: -0.1, density: -0.1, colors: ["#e8e3d4", "#c4b9d5"] },
  { tag: "tech", words: ["科技", "赛博", "电子", "ai", "AI", "tech"], bpm: 2, energy: 0.02, density: -0.02, colors: ["#a9b6c9", "#b8c7ad"] },
  { tag: "focus", words: ["专注", "学习", "工作", "coding", "focus"], bpm: -2, energy: -0.03, density: -0.08, colors: ["#b8c7ad", "#d8caa7"] }
];

export const NEXT_PROMPTS = [
  "雨天 图书馆 钢琴 温柔 阅读",
  "森林 清晨 吉他 白雾 宁静",
  "火车 夜晚 轻鼓 规律 读书",
  "星空 数学 钢琴 漂浮 冷静",
  "海岸 黄昏 吉他 浪潮 阅读",
  "雪夜 图书馆 钢琴 留白 专注",
  "午后 纸页 轻鼓 复习 安静",
  "窗边 咖啡 慢钢琴 写作",
  "城市 夜雨 吉他 慢鼓 专注",
  "清晨 阳光 钢琴 呼吸 学习",
  "深夜 台灯 低音 轻鼓 阅读",
  "湖边 微风 吉他 平静",
  "旧磁带 钢琴 慢节奏 休息",
  "月光 房间 鼓刷 柔和",
  "竹林 清风 木琴 钢琴",
  "地铁 远行 低鼓 读书",
  "雨后 街灯 吉他 慢拍",
  "暖冬 沙发 钢琴 复习",
  "云层 漂浮 轻鼓 空旷",
  "晨雾 花园 吉他 宁静",
  "晚霞 海岸 钢琴 慢鼓",
  "老书店 木质 吉他 专注",
  "夜航 星光 钢琴 低音",
  "周末 午后 鼓点 吉他 放松"
];

export const QUOTES: Quote[] = [
  { id: "local-socrates-1", text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
  { id: "local-mandela-1", text: "It always seems impossible until it is done.", author: "Nelson Mandela" },
  { id: "local-da-vinci-1", text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { id: "local-buddha-1", text: "What we think, we become.", author: "Buddha" },
  { id: "local-lao-tzu-1", text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { id: "local-aristotle-1", text: "Well begun is half done.", author: "Aristotle" },
  { id: "local-jobs-1", text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { id: "local-edison-1", text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { id: "local-tolkien-1", text: "Not all those who wander are lost.", author: "J. R. R. Tolkien" },
  { id: "local-oprah-1", text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
  { id: "local-twain-1", text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { id: "local-roosevelt-1", text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { id: "local-franklin-1", text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { id: "local-curie-1", text: "Be less curious about people and more curious about ideas.", author: "Marie Curie" },
  { id: "local-austen-1", text: "There is no charm equal to tenderness of heart.", author: "Jane Austen" },
  { id: "local-woolf-1", text: "Arrange whatever pieces come your way.", author: "Virginia Woolf" },
  { id: "local-emerson-1", text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson" },
  { id: "local-confucius-1", text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { id: "local-helen-keller-1", text: "Alone we can do so little; together we can do so much.", author: "Helen Keller" },
  { id: "local-lewis-1", text: "You are never too old to set another goal or to dream a new dream.", author: "C. S. Lewis" }
];

export const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11
};

export const ROOTS = Object.keys(NOTE_OFFSETS);
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14];
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];
export const PENTA_SCALE = [0, 3, 5, 7, 10, 12, 15];

export function normalizeTrack(track: Track): Track {
  const seed = track.seed ?? hashString(`${track.title || ""}-${track.prompt || ""}-${track.bpm || 0}`);
  const normalized: Track = {
    ...track,
    seed,
    bpm: clamp(track.bpm, 62, 122),
    energy: clamp(track.energy, 0.24, 0.84),
    density: clamp(track.density, 0.16, 0.62),
    story: track.story?.length ? track.story : ["新的学习声场已经生成。"],
    quote: track.quote || null,
    palette: uniquePalette(track.palette)
  };

  if (!normalized.visual) {
    normalized.visual = createVisualGenome(normalized, seed);
  }

  return normalized;
}

export function createTrackFromPrompt(prompt: string, count: number, baseTrack: Track | null = null, intent = "remix"): Track {
  const terms = parsePromptTerms(prompt);
  const seed = hashString(`${intent}-${prompt}-${count}-${Date.now()}`);
  const random = mulberry32(seed);
  const lowerPrompt = prompt.toLowerCase();
  const matched = TOKEN_MAP.filter((entry) => entry.words.some((word) => lowerPrompt.includes(word.toLowerCase())));
  const tags = [...new Set([...(intent === "remix" && baseTrack ? baseTrack.tags : []), ...matched.map((entry) => entry.tag)])];
  if (!tags.length) tags.push("focus", "tech");

  const attributeForce = terms.length ? clamp(terms.length / 8, 0.1, 0.7) : 0.18;
  const baseBpm = baseTrack ? baseTrack.bpm : 64 + Math.round(random() * 18);
  const bpmDelta = matched.reduce((value, entry) => value + entry.bpm, 0) * 0.62 + Math.round((random() - 0.5) * 10 * attributeForce);
  const bpm = baseBpm * (intent === "remix" ? 0.72 : 0.28) + (baseBpm + bpmDelta) * (intent === "remix" ? 0.28 : 0.72);
  const baseEnergy = baseTrack ? baseTrack.energy : 0.28 + random() * 0.14;
  const baseDensity = baseTrack ? baseTrack.density : 0.26 + random() * 0.16;
  const energy = baseEnergy + matched.reduce((value, entry) => value + entry.energy, 0) * 0.42 + (random() - 0.5) * 0.07;
  const density = baseDensity + matched.reduce((value, entry) => value + entry.density, 0) * 0.42 + terms.length * 0.007 + (random() - 0.5) * 0.06;
  let root = ROOTS[(Math.floor(random() * ROOTS.length) + count * (3 + count % 5)) % ROOTS.length];
  if (intent === "remix" && baseTrack && random() > 0.32) {
    root = baseTrack.root;
  } else if (baseTrack?.root === root) {
    root = ROOTS[(ROOTS.indexOf(root) + 5 + count % 4) % ROOTS.length];
  }
  const palette = buildPalette(matched, random, baseTrack);
  const title = makeRemixTitle(tags, random, intent);
  const mode = pickMode(tags, energy);
  const visual = createVisualGenome({ tags, palette, title, prompt, energy, density } as Track, seed);

  return normalizeTrack({
    seed,
    visual,
    sourceTerms: terms,
    generation: intent,
    parentTitle: baseTrack?.title,
    title,
    prompt,
    bpm,
    mode,
    root,
    energy,
    density,
    tags,
    palette,
    story: makeStory(prompt, tags, terms, intent, baseTrack)
  });
}

export function parsePromptTerms(prompt: string): string[] {
  return [...new Set(
    prompt
      .split(/[\s,，、。；;|/]+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 12)
  )];
}

export function mergePrompt(a: string, b: string): string {
  return parsePromptTerms(`${a} ${b}`).join(" ");
}

export function pickPromptAccent(count: number): string {
  const accents = ["粒子交叉", "几何融合", "低频脉冲", "明暗切换", "漂浮碎片", "轨迹线", "随机形状"];
  return accents[count % accents.length];
}

export function createVisualGenome(track: Partial<Track>, seed: number): VisualGenome {
  const random = mulberry32(seed ^ 0x9e3779b9);
  const tags = track.tags || [];
  const temperament = random();
  const contrast = temperament < 0.34 ? "quiet" : temperament > 0.72 ? "ornate" : "balanced";
  const layerCount = contrast === "quiet" ? Math.floor(3 + random() * 3) : contrast === "ornate" ? Math.floor(8 + random() * 7) : Math.floor(5 + random() * 6);
  const calmBias = tags.includes("calm") || tags.includes("library") ? 0.28 : 0;
  const spaciousBias = tags.includes("space") ? 0.24 : 0;
  const wateryBias = tags.includes("rain") || tags.includes("ocean") ? 0.26 : 0;
  const layers = Array.from({ length: layerCount }, () => {
    const kind = pick(VISUAL_LAYER_KINDS, random);
    return {
      kind,
      phase: random() * Math.PI * 2,
      speed: 0.12 + random() * 0.72 + (track.energy || 0.35) * 0.22,
      amplitude: 0.12 + random() * 0.76 + wateryBias * random(),
      frequency: 0.55 + random() * 5.4,
      radius: 0.16 + random() * 0.78 + spaciousBias,
      twist: (random() - 0.5) * (1.2 + random() * 4.8),
      symmetry: Math.floor(3 + random() * 10),
      colorIndex: Math.floor(random() * 7),
      weight: 0.2 + random() * 0.8,
      softness: clamp(0.55 + calmBias + random() * 0.38, 0.45, 1)
    };
  });

  return {
    seed,
    layers,
    contrast,
    rotation: random() * Math.PI * 2,
    drift: 0.6 + random() * 1.4,
    complexity: clamp(0.32 + (track.density || 0.5) * 0.68 + random() * 0.18, 0.35, 1),
    symmetry: Math.floor(3 + random() * 7),
    colorShift: random(),
    particleScale: 0.68 + random() * 0.72,
    connectionRate: 0.08 + random() * 0.22,
    bloomRate: 0.16 + random() * 0.32,
    calmness: clamp(0.5 + calmBias + random() * 0.22, 0.48, 0.92)
  };
}

function buildPalette(matched: TokenMapEntry[], random: () => number, baseTrack: Track | null): string[] {
  const base = baseTrack?.palette?.slice(0, 3) || ["#050506"];
  const mapped = matched.flatMap((entry) => entry.colors);
  const accents = ["#cfd8c5", "#b8c7ad", "#d8caa7", "#c9b18c", "#c4b9d5", "#a9b6c9", "#e8e3d4"];
  return ["#050506", ...mapped, ...base, pick(accents, random), pick(accents, random)];
}

function makeRemixTitle(tags: TrackTag[], random: () => number, intent = "remix"): string {
  const opening: Record<string, string> = {
    rain: "Rain",
    forest: "Forest",
    calm: "Quiet",
    train: "Rail",
    space: "Orbit",
    library: "Page",
    city: "Metro",
    ocean: "Tide",
    snow: "Frost",
    tech: "Signal",
    focus: "Focus"
  };
  const closing = intent === "next"
    ? ["Sketch", "Drift", "Route", "Bloom", "Current", "Frame"]
    : ["Blend", "Field", "Pulse", "Session", "Grid", "Draft"];
  const first = opening[tags[0]] || "Study";
  return `${first} ${pick(closing, random)} ${String(Math.floor(random() * 900) + 100)}`;
}

function pickMode(tags: TrackTag[], energy: number): string {
  if (tags.includes("train")) return "Flow";
  if (tags.includes("library") || tags.includes("calm")) return "Deep";
  if (tags.includes("space")) return "Clear";
  return energy > 0.52 ? "Bright" : "Focus";
}

function makeStory(prompt: string, tags: TrackTag[], terms = parsePromptTerms(prompt), intent = "remix", baseTrack: Track | null = null): string[] {
  const subject = terms.length ? terms.join("、") : prompt.replace(/\s+/g, "、").replace(/[，,]+/g, "、");
  const movement = tags.includes("train")
    ? "节奏像轨道一样向前推"
    : tags.includes("rain")
      ? "细碎高频像雨线一样落下"
      : tags.includes("forest")
        ? "绿色噪声缓慢呼吸"
        : tags.includes("space")
          ? "旋律在轨道上漂浮"
          : "低频把注意力稳稳托住";
  const blend = intent === "remix" && baseTrack
    ? `保留「${baseTrack.title}」的底色，把「${subject}」压进新的节奏层。`
    : `以「${subject}」生成新的学习声场。`;
  const visual = "粒子会按鼓点扩散，按低频推移，按旋律留下短暂轨迹。";
  return [blend, movement + "，形状在粒子、线框、波形和轨道之间交叉融合。", visual];
}

export function normalizeQuote(raw: Partial<Quote> & { _id?: string; content?: string }): Quote {
  return {
    id: String(raw.id || raw._id || hashString(`${raw.content || raw.text}-${raw.author}`)),
    text: String(raw.text || raw.content || "").trim(),
    author: String(raw.author || "Unknown").trim()
  };
}

export function formatQuote(quote: Quote | null | undefined): string {
  if (!quote) return "";
  return `"${quote.text}" - ${quote.author}`;
}

let currentQuoteIndex = -1;

export function getFallbackQuote(seen = getSeenQuoteIds()): Quote {
  const available = QUOTES.filter((quote) => !seen.has(quote.id));
  if (!available.length) {
    saveSeenQuoteIds(new Set());
    currentQuoteIndex = -1;
    return QUOTES[0];
  }
  currentQuoteIndex = (currentQuoteIndex + 1) % available.length;
  return available[currentQuoteIndex];
}

export function getSeenQuoteIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(QUOTE_STORAGE_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveSeenQuoteIds(seen: Set<string>): void {
  try {
    localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify([...seen].slice(-600)));
  } catch {
    // Storage can be unavailable in private contexts; quote fallback still works.
  }
}

export function rememberQuote(quote: Quote): void {
  if (!quote?.id) return;
  const seen = getSeenQuoteIds();
  seen.add(quote.id);
  saveSeenQuoteIds(seen);
}
