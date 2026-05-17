import type { MusicState, NoteSpark, Particle, Ring, Track, VisualEvent, VisualGenome, VisualLayer } from "./types";
import { PRESET_TRACKS, createVisualGenome, normalizeTrack } from "./tracks";
import { clamp, hashString, mixHex, mulberry32, rgba } from "./math";
import type { AudioEngine } from "./audio";

interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
}

export class StoryVisualizer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audio: AudioEngine;
  track = normalizeTrack(PRESET_TRACKS[0]);
  particles: Particle[] = [];
  rails: Array<{ offset: number; color: string }> = [];
  width = 0;
  height = 0;
  dpr = 1;
  time = 0;
  intensity = 0.74;
  beatPulse = 0;
  bassPush = 0;
  sparkPulse = 0;
  padBloom = 0;
  morph = 1;
  morphFromTrack = this.track;
  rings: Ring[] = [];
  noteSparks: NoteSpark[] = [];
  frameId = 0;
  resizeHandler = () => this.resize();

  constructor(canvas: HTMLCanvasElement, audioEngine: AudioEngine) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is not available");

    this.canvas = canvas;
    this.ctx = ctx;
    this.audio = audioEngine;
    window.addEventListener("resize", this.resizeHandler);
    this.resize();
  }

  destroy(): void {
    window.removeEventListener("resize", this.resizeHandler);
    if (this.frameId) cancelAnimationFrame(this.frameId);
  }

  start(): void {
    const frame = () => {
      this.draw();
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  setTrack(track: Track): void {
    const previousTrack = this.track;
    const previousParticles = this.particles;
    this.track = normalizeTrack(track);
    this.morphFromTrack = previousTrack;
    this.morph = previousParticles.length ? 0 : 1;
    this.createParticles(previousParticles);
  }

  setIntensity(value: number): void {
    this.intensity = clamp(value, 0.2, 1);
    this.createParticles();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.createParticles();
  }

  createParticles(previousParticles: Particle[] = []): void {
    const genome = this.track.visual || createVisualGenome(this.track, this.track.seed || 1);
    const contrastBoost = genome.contrast === "ornate" ? 1.04 : genome.contrast === "quiet" ? 0.64 : 0.82;
    const count = Math.floor(((this.width * this.height) / 6200 * this.intensity + 170) * contrastBoost);
    const random = mulberry32(this.track.seed || hashString(this.track.title));
    const palette = this.track.palette || ["#d8caa7", "#b8c7ad", "#cfd8c5"];

    this.particles = Array.from({ length: Math.min(count, 520) }, (_, index) => {
      const previous = previousParticles[index % Math.max(previousParticles.length, 1)];
      const spread = random();
      const angle = random() * Math.PI * 2;
      const radius = Math.pow(random(), genome.contrast === "quiet" ? 1.1 : 0.72) * (0.32 + spread * 1.05);
      const x = Math.cos(angle) * radius * (0.9 + spread * 0.42) + (random() - 0.5) * 0.2;
      const y = Math.sin(angle) * radius * (0.66 + spread * 0.36) + (random() - 0.5) * 0.2;
      const fromX = previous?.x ?? x * (1.2 + random() * 0.5);
      const fromY = previous?.y ?? y * (1.2 + random() * 0.5);
      return {
        x: fromX,
        y: fromY,
        originX: previous?.originX ?? fromX,
        originY: previous?.originY ?? fromY,
        fromX,
        fromY,
        fromOriginX: previous?.originX ?? fromX,
        fromOriginY: previous?.originY ?? fromY,
        targetX: x,
        targetY: y,
        targetOriginX: x,
        targetOriginY: y,
        z: random(),
        vx: (random() - 0.5) * 0.001,
        vy: (random() - 0.5) * 0.0008,
        size: 0.38 + random() * 1.05,
        twinkle: random() * Math.PI * 2,
        lane: random(),
        color: previous?.color || palette[(index + 1) % palette.length],
        fromColor: previous?.color || palette[index % palette.length],
        targetColor: index % 11 === 0 ? palette[(index + 2) % palette.length] : palette[(index + 1) % palette.length]
      };
    });

    this.rails = Array.from({ length: 22 }, (_, index) => ({
      offset: index / 22,
      color: this.track.palette[(index + 2) % this.track.palette.length]
    }));
    this.rings = [];
    this.noteSparks = [];
  }

  draw(): void {
    this.time += 0.016;
    this.morph = clamp(this.morph + 0.006, 0, 1);
    const analysis = this.audio.getAnalysis();
    const events = this.audio.consumeVisualEvents(this.audio.ctx?.currentTime || 0);
    this.applyMusicEvents(events);
    this.decayMusicState();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx);
    if (analysis.climax > 0.58 && this.track.visual?.contrast === "ornate") this.drawGrid(ctx, analysis);
    this.drawAmbientVeils(ctx, analysis);
    this.drawGenomeLayers(ctx, analysis);
    this.drawBreathingField(ctx, analysis);
    this.drawParticles(ctx, analysis);
    this.drawNoteSparks(ctx, analysis);
    this.drawRings(ctx);
    if (this.hasLayer("bloom") && analysis.climax > 0.62) this.drawCore(ctx, analysis);
    if (this.track.tags.includes("rain")) this.drawRain(ctx, analysis);
    if (this.track.tags.includes("train")) this.drawRailPulse(ctx, analysis);
  }

  transitionProgress(): number {
    const t = clamp(this.morph, 0, 1);
    return t * t * (3 - 2 * t);
  }

  getRenderPalette(): string[] {
    const toPalette = this.track.palette || ["#d8caa7", "#b8c7ad", "#cfd8c5"];
    const fromPalette = this.morphFromTrack?.palette || toPalette;
    if (this.morph >= 0.995) return toPalette;

    const t = this.transitionProgress();
    const length = Math.max(fromPalette.length, toPalette.length, 3);
    return Array.from({ length }, (_, index) => {
      const fromColor = fromPalette[index % fromPalette.length] || "#07090a";
      const toColor = toPalette[index % toPalette.length] || fromColor;
      return mixHex(fromColor, toColor, t);
    });
  }

  hasLayer(kind: string): boolean {
    return Boolean(this.track.visual?.layers?.some((layer) => layer.kind === kind));
  }

  applyMusicEvents(events: VisualEvent[]): void {
    for (const event of events) {
      const power = clamp(event.power || 0.4, 0, 1.2);

      if (event.type === "kick") {
        this.beatPulse = Math.max(this.beatPulse, power);
        this.bassPush = Math.max(this.bassPush, power * 0.72);
        this.rings.push({ age: 0, power, color: this.getRenderPalette()[3] || "#d8caa7", width: 1.2 + power * 1.6 });
        this.scatterParticles(power, 0.018);
      }

      if (event.type === "bass") {
        this.bassPush = Math.max(this.bassPush, power);
        this.rings.push({ age: 0, power: power * 0.58, color: this.getRenderPalette()[2] || "#b8c7ad", width: 0.9 + power * 1.1 });
      }

      if (event.type === "snare" || event.type === "hat" || event.type === "texture") {
        this.sparkPulse = Math.max(this.sparkPulse, power);
        this.scatterParticles(power, event.type === "hat" ? 0.008 : 0.012);
      }

      if (event.type === "pluck" || event.type === "metal") {
        this.sparkPulse = Math.max(this.sparkPulse, power);
        this.padBloom = Math.max(this.padBloom, power * 0.28);
        this.spawnNoteSpark(event);
      }
    }

    if (this.rings.length > 24) this.rings.splice(0, this.rings.length - 24);
    if (this.noteSparks.length > 80) this.noteSparks.splice(0, this.noteSparks.length - 80);
  }

  decayMusicState(): void {
    this.beatPulse *= 0.88;
    this.bassPush *= 0.9;
    this.sparkPulse *= 0.82;
    this.padBloom *= 0.985;

    for (const ring of this.rings) ring.age += 0.018;
    this.rings = this.rings.filter((ring) => ring.age < 1.1);

    for (const spark of this.noteSparks) {
      spark.age += 0.018;
      spark.x += spark.vx;
      spark.y += spark.vy;
    }
    this.noteSparks = this.noteSparks.filter((spark) => spark.age < spark.life);
  }

  scatterParticles(power: number, amount: number): void {
    for (let i = 0; i < this.particles.length; i += 15) {
      const particle = this.particles[i];
      const length = Math.max(0.08, Math.hypot(particle.x, particle.y));
      particle.vx += (particle.x / length) * amount * power * 0.3 * (0.4 + particle.z);
      particle.vy += (particle.y / length) * amount * power * 0.22 * (0.4 + particle.z);
    }
  }

  spawnNoteSpark(event: VisualEvent): void {
    const freq = event.freq || 440;
    const normalized = clamp((Math.log2(freq / 110) % 3) / 3, 0, 1);
    const x = (normalized - 0.5) * 1.2;
    const lane = ((event.step || 0) % 16) / 16;
    this.noteSparks.push({
      x,
      y: (lane - 0.5) * 0.3,
      vx: (x >= 0 ? 1 : -1) * (0.004 + (event.power || 0.4) * 0.004),
      vy: (Math.random() - 0.5) * 0.006,
      age: 0,
      life: 0.55 + (event.power || 0.4) * 0.45,
      power: (event.power || 0.45) * 0.72,
      color: event.type === "metal" ? "#d8caa7" : "#cfd8c5"
    });
  }

  drawBackground(ctx: CanvasRenderingContext2D): void {
    const palette = this.getRenderPalette();
    const genome = this.track.visual || createVisualGenome(this.track, this.track.seed || 1);
    const quiet = genome.contrast === "quiet";
    const ornate = genome.contrast === "ornate";

    ctx.fillStyle = "#020404";
    ctx.fillRect(0, 0, this.width, this.height);

    const base = ctx.createLinearGradient(0, 0, this.width, this.height);
    base.addColorStop(0, rgba(mixHex(palette[0] || "#050506", palette[1] || "#d8fff8", quiet ? 0.08 : 0.13), 1));
    base.addColorStop(0.52, rgba(mixHex(palette[0] || "#050506", palette[1] || "#d8fff8", quiet ? 0.18 : 0.25), 1));
    base.addColorStop(1, rgba(mixHex("#000000", palette[2] || "#d8fff8", quiet ? 0.04 : 0.08), 1));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, this.width, this.height);

    const glow = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      0,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.78
    );
    glow.addColorStop(0, rgba(palette[1] || "#e7e1cf", (quiet ? 0.05 : ornate ? 0.078 : 0.066) + this.padBloom * (ornate ? 0.052 : 0.04)));
    glow.addColorStop(0.52, rgba(palette[2] || "#cfd8c5", (quiet ? 0.026 : 0.038) + this.bassPush * 0.032));
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawAmbientVeils(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const t = this.transitionProgress();
    if (this.morph < 0.995) this.drawAmbientVeilSet(ctx, analysis, this.morphFromTrack, 1 - t);
    this.drawAmbientVeilSet(ctx, analysis, this.track, this.morph < 0.995 ? t : 1);
  }

  drawAmbientVeilSet(ctx: CanvasRenderingContext2D, analysis: MusicState, track: Track, opacity: number): void {
    if (opacity <= 0.005) return;

    const palette = track === this.track ? this.getRenderPalette() : track.palette || ["#d8caa7", "#b8c7ad", "#cfd8c5"];
    const genome = track.visual || createVisualGenome(track, track.seed || 1);
    const random = mulberry32((track.seed || 1) ^ 0x2c7f4a15);
    const ribbons = genome.contrast === "ornate" ? 7 : genome.contrast === "quiet" ? 4 : 5;
    const lift = 0.7 + analysis.climax * 0.95 + this.padBloom * 0.35;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < ribbons; i += 1) {
      const color = palette[(i + 1) % palette.length] || "#d8caa7";
      const phase = random() * Math.PI * 2;
      const vertical = random() > 0.48;
      const sway = 0.06 + random() * 0.2 + analysis.climax * 0.08;
      const drift = this.time * (0.025 + random() * 0.055) + phase;
      const alpha = (0.026 + random() * 0.02 + analysis.climax * 0.026) * lift * opacity;
      const width = Math.max(this.width, this.height) * (0.012 + random() * 0.022 + analysis.climax * 0.008);

      ctx.strokeStyle = rgba(color, clamp(alpha, 0, genome.contrast === "ornate" ? 0.095 : 0.078));
      ctx.lineWidth = width;
      ctx.shadowBlur = width * (0.7 + analysis.climax * 0.6);
      ctx.shadowColor = rgba(color, (0.12 + analysis.climax * 0.08) * opacity);
      ctx.beginPath();

      if (vertical) {
        const x = this.width * (0.08 + random() * 0.84) + Math.sin(drift) * this.width * sway;
        ctx.moveTo(x - this.width * 0.18, -this.height * 0.18);
        ctx.bezierCurveTo(
          x + Math.sin(drift * 0.8) * this.width * 0.26,
          this.height * 0.22,
          x - Math.cos(drift * 0.65) * this.width * 0.32,
          this.height * 0.72,
          x + Math.sin(drift * 0.45) * this.width * 0.22,
          this.height * 1.18
        );
      } else {
        const y = this.height * (0.16 + random() * 0.68) + Math.cos(drift) * this.height * sway;
        ctx.moveTo(-this.width * 0.16, y + Math.sin(drift * 0.7) * this.height * 0.1);
        ctx.bezierCurveTo(
          this.width * 0.28,
          y - Math.cos(drift) * this.height * 0.24,
          this.width * 0.72,
          y + Math.sin(drift * 0.8) * this.height * 0.22,
          this.width * 1.16,
          y - Math.cos(drift * 0.42) * this.height * 0.12
        );
      }

      ctx.stroke();
    }

    const wash = ctx.createRadialGradient(
      this.width * (0.42 + Math.sin(this.time * 0.04) * 0.12),
      this.height * (0.48 + Math.cos(this.time * 0.035) * 0.1),
      0,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.92
    );
    wash.addColorStop(0, rgba(palette[1] || "#cfd8c5", (0.035 + analysis.mid * 0.025 + analysis.climax * 0.022) * opacity));
    wash.addColorStop(0.42, rgba(palette[2] || "#b8c7ad", (0.018 + analysis.low * 0.018) * opacity));
    wash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.shadowBlur = 0;
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  drawGrid(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const centerX = this.width * 0.5;
    const topY = this.height * 0.16;
    const bottomY = this.height * 0.88;
    const topHalf = Math.min(this.width * 0.42, 720);
    const bottomHalf = Math.min(this.width * 0.54, 960);
    const rows = 9;
    const columns = 10;

    ctx.save();
    ctx.strokeStyle = `rgba(200, 196, 178, ${0.012 + analysis.mid * 0.018 + analysis.climax * 0.018})`;
    ctx.lineWidth = 0.45 + analysis.climax * 0.18;

    for (let i = 0; i <= rows; i += 1) {
      const t = i / rows;
      const y = topY + t * (bottomY - topY);
      const half = topHalf + t * (bottomHalf - topHalf);
      ctx.beginPath();
      ctx.moveTo(centerX - half, y);
      ctx.lineTo(centerX + half, y);
      ctx.stroke();
    }

    for (let i = 0; i <= columns; i += 1) {
      const offset = (i / columns) * 2 - 1;
      ctx.beginPath();
      ctx.moveTo(centerX + offset * topHalf, topY);
      ctx.lineTo(centerX + offset * bottomHalf, bottomY);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const bandWidth = Math.min(this.width * (1.04 + analysis.climax * 0.3), 2200);
    const bandHeight = Math.max(260, this.height * (0.68 + analysis.climax * 0.34));
    const speed = 0.00034 + this.track.energy * 0.00055 + analysis.high * 0.00065 + analysis.climax * 0.00125 + this.bassPush * 0.00075;
    const palette = this.getRenderPalette();
    const recipe = this.track.visual || createVisualGenome(this.track, this.track.seed || 1);
    const quiet = recipe.contrast === "quiet";
    const ornate = recipe.contrast === "ornate";

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const particle of this.particles) {
      const trainBias = this.track.tags.includes("train") ? 1.2 : 0.18 + particle.lane * 0.46;
      const rainBias = this.track.tags.includes("rain") ? 0.00055 : 0;
      const outward = analysis.climax * 0.00042 + this.bassPush * 0.0005;
      const radius = Math.max(0.12, Math.hypot(particle.x, particle.y));
      const targetX = particle.targetX ?? particle.originX ?? particle.x;
      const targetY = particle.targetY ?? particle.originY ?? particle.y;
      const targetOriginX = particle.targetOriginX ?? targetX;
      const targetOriginY = particle.targetOriginY ?? targetY;
      const ease = 0.004 + this.morph * 0.014;
      particle.x += (targetX - particle.x) * ease + (particle.vx + speed * trainBias * 0.24 + (particle.x / radius) * outward) * (0.62 + particle.z);
      particle.y += (targetY - particle.y) * ease + particle.vy + Math.sin(this.time * 0.45 + particle.twinkle) * 0.00035 + rainBias + (particle.y / radius) * outward * 0.82;
      particle.originX = (particle.originX ?? particle.x) + (targetOriginX - (particle.originX ?? particle.x)) * (0.003 + this.morph * 0.012);
      particle.originY = (particle.originY ?? particle.y) + (targetOriginY - (particle.originY ?? particle.y)) * (0.003 + this.morph * 0.012);
      particle.vx *= 0.987;
      particle.vy *= 0.987;

      if (particle.x > 1.45) particle.x = -1.35 + Math.random() * 0.2;
      if (particle.x < -1.45) particle.x = 1.35 - Math.random() * 0.2;
      if (particle.y > 1.08) particle.y = -1.02 + Math.random() * 0.18;
      if (particle.y < -1.08) particle.y = 1.02 - Math.random() * 0.18;

      const projected = this.projectParticle(particle, recipe, centerX, centerY, bandWidth, bandHeight, analysis);
      const twinkle = Math.sin(this.time * 1.4 + particle.twinkle) * 0.026;
      const alpha = 0.052 + analysis.level * 0.055 + analysis.climax * (ornate ? 0.045 : 0.032) + this.sparkPulse * 0.05 + twinkle;
      const dotRadius = particle.size * projected.scale * (0.5 + particle.z * 0.58 + analysis.high * 0.12 + analysis.climax * (ornate ? 0.24 : quiet ? 0.08 : 0.14));

      const color = particle.fromColor && particle.targetColor
        ? mixHex(particle.fromColor, particle.targetColor, this.transitionProgress())
        : particle.targetColor || particle.color || palette[1];
      ctx.globalAlpha = clamp(alpha, quiet ? 0.024 : 0.032, ornate ? 0.28 : 0.22);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();

      if (particle.z > 0.88 && analysis.climax > 0.52) {
        ctx.globalAlpha = clamp(alpha * 0.08, 0.006, 0.045);
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, dotRadius * (2.6 + analysis.climax * 1.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cloud = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, bandWidth * 0.68);
    cloud.addColorStop(0, rgba(palette[1] || "#d8caa7", (quiet ? 0.028 : 0.036) + analysis.mid * 0.018 + analysis.climax * 0.026));
    cloud.addColorStop(0.52, rgba(palette[2] || "#cfd8c5", 0.018 + analysis.mid * 0.014 + analysis.climax * 0.02));
    cloud.addColorStop(1, rgba(palette[1] || "#ff5a2f", 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = cloud;
    ctx.fillRect(centerX - bandWidth, centerY - bandHeight, bandWidth * 2, bandHeight * 2);
    ctx.restore();
  }

  drawBreathingField(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const palette = this.getRenderPalette();
    const cy = this.height * 0.52;
    const random = mulberry32((this.track.seed || 1) ^ 0x4479b31);
    const lanes = 14;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 0.65 + analysis.climax * 0.46;

    for (let lane = 0; lane < lanes; lane += 1) {
      const yOffset = (lane / (lanes - 1) - 0.5) * this.height * (0.72 + analysis.climax * 0.16);
      const phase = random() * Math.PI * 2 + this.time * (0.05 + random() * 0.08);
      const color = palette[(lane + 1) % palette.length] || "#d8caa7";
      ctx.strokeStyle = rgba(color, 0.032 + analysis.climax * 0.024);
      ctx.beginPath();

      for (let i = 0; i <= 96; i += 1) {
        const t = i / 96;
        const x = t * this.width;
        const curve = Math.sin(t * Math.PI * 2 * (1.1 + random() * 1.6) + phase) * this.height * (0.018 + analysis.climax * 0.018);
        const drift = Math.sin(t * Math.PI + this.time * 0.08 + lane) * this.height * 0.025;
        const y = cy + yOffset + curve + drift;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  projectParticle(particle: Particle, recipe: VisualGenome, centerX: number, centerY: number, bandWidth: number, bandHeight: number, musicState: MusicState): ProjectedPoint {
    const layers = recipe.layers?.length ? recipe.layers : [{ kind: "flow", phase: 0, speed: 0.4, frequency: 1.8, radius: 0.5, twist: 0.4, weight: 1, amplitude: 0.2, symmetry: 4, colorIndex: 0, softness: 1 }];
    const calm = recipe.contrast === "quiet";
    const ornate = recipe.contrast === "ornate";
    const climax = musicState.climax || 0;
    const spread = calm ? 1.02 : ornate ? 1.22 : 1.12;
    const originX = particle.originX ?? particle.x;
    const originY = particle.originY ?? particle.y;
    const dynamicX = particle.x * 0.72 + originX * 0.28;
    const dynamicY = particle.y * 0.72 + originY * 0.28;
    const baseX = centerX + dynamicX * this.width * 0.62 * spread;
    const baseY = centerY + dynamicY * this.height * 0.56 * spread;
    let x = baseX;
    let y = baseY;
    let total = 1;

    for (let i = 0; i < Math.min(layers.length, 7); i += 1) {
      const layer = layers[i];
      const weight = layer.weight * (0.07 + climax * (ornate ? 0.18 : 0.12));
      const t = this.time * layer.speed * (0.22 + climax * (ornate ? 0.72 : 0.48)) + layer.phase + particle.twinkle;
      const angle = Math.atan2(originY, originX) + layer.twist * 0.28 + t * 0.12;
      const dist = Math.hypot(originX, originY);
      let tx = baseX;
      let ty = baseY;

      if (layer.kind === "orbit" || layer.kind === "flow") {
        const r = Math.min(this.width, this.height) * (0.12 + layer.radius * 0.36 + dist * 0.28) * (0.92 + climax * 0.34);
        tx = centerX + Math.cos(angle + t * 0.28) * r + Math.sin(t + particle.lane * 8) * bandWidth * 0.045;
        ty = centerY + Math.sin(angle + t * 0.28) * r * (0.72 + layer.amplitude * 0.14) + Math.cos(t * 0.54) * bandHeight * 0.055;
      } else if (layer.kind === "ribbon" || layer.kind === "wave") {
        tx = baseX;
        ty = baseY + Math.sin(originX * layer.frequency * 5 + t) * bandHeight * (0.06 + layer.amplitude * 0.12 + climax * 0.08);
      } else if (layer.kind === "bloom") {
        const petals = layer.symmetry || 6;
        const r = dist * Math.min(this.width, this.height) * (0.22 + climax * 0.2);
        const petal = 1 + Math.sin(angle * petals + t) * (0.12 + climax * 0.18);
        tx = centerX + Math.cos(angle) * r * petal;
        ty = centerY + Math.sin(angle) * r * petal * 0.72;
      } else if (layer.kind === "lattice") {
        tx = baseX + Math.sin(t + particle.lane * 12) * bandWidth * 0.05;
        ty = baseY + Math.cos(t * 0.7 + particle.lane * 9) * bandHeight * (0.08 + climax * 0.16);
      } else {
        tx = baseX + Math.sin(t) * bandWidth * 0.08;
        ty = baseY + Math.cos(t * 0.7) * bandHeight * 0.08;
      }

      x += tx * weight;
      y += ty * weight;
      total += weight;
    }

    return {
      x: x / total,
      y: y / total,
      scale: (calm ? 0.38 : ornate ? 0.58 : 0.46) + particle.z * (0.48 + climax * 0.22)
    };
  }

  drawGenomeLayers(ctx: CanvasRenderingContext2D, musicState: MusicState): void {
    const t = this.transitionProgress();
    if (this.morph < 0.995) this.drawGenomeLayerSet(ctx, musicState, this.morphFromTrack, 1 - t);
    this.drawGenomeLayerSet(ctx, musicState, this.track, this.morph < 0.995 ? t : 1);
  }

  drawGenomeLayerSet(ctx: CanvasRenderingContext2D, musicState: MusicState, track: Track, opacity: number): void {
    if (opacity <= 0.005) return;

    const genome = track.visual || createVisualGenome(track, track.seed || 1);
    const palette = track === this.track ? this.getRenderPalette() : track.palette || ["#f4f7f1", "#cfd8c5", "#d8caa7"];
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const scale = Math.min(this.width, this.height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    genome.layers.forEach((layer) => {
      const color = palette[layer.colorIndex % palette.length] || "#f4f7f1";
      const time = this.time * layer.speed * (0.62 + musicState.climax * 2.15) + layer.phase;
      const layerMood = genome.contrast === "quiet" ? 0.74 : genome.contrast === "ornate" ? 1.12 : 0.92;
      const alpha = (0.016 + layer.weight * 0.038 + musicState.climax * (genome.contrast === "ornate" ? 0.056 : 0.036)) * layer.softness * layerMood * opacity;
      const radius = scale * layer.radius * (0.2 + musicState.climax * 0.1);
      ctx.strokeStyle = rgba(color, clamp(alpha, 0, genome.contrast === "ornate" ? 0.16 : 0.11));
      ctx.lineWidth = 0.65 + layer.weight * 0.72 + musicState.climax * (genome.contrast === "ornate" ? 0.72 : 0.46);

      if (layer.kind === "flow") this.drawGenomeFlow(ctx, cx, cy, radius, time, layer, musicState);
      else if (layer.kind === "orbit") this.drawGenomeOrbit(ctx, cx, cy, radius, time, layer, musicState);
      else if (layer.kind === "ribbon") this.drawGenomeRibbon(ctx, cx, cy, radius, time, layer, musicState);
      else if (layer.kind === "lattice") this.drawGenomeLattice(ctx, cx, cy, radius, time, layer, musicState);
      else if (layer.kind === "bloom") this.drawGenomeBloom(ctx, cx, cy, radius, time, layer, musicState);
      else if (layer.kind === "wave") this.drawGenomeWave(ctx, cx, cy, radius, time, layer, musicState);
      else this.drawGenomeDrift(ctx, cx, cy, radius, time, layer, musicState);
    });
    ctx.restore();
  }

  drawGenomeFlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, layer: VisualLayer, musicState: MusicState): void {
    ctx.beginPath();
    const points = 120;
    for (let i = 0; i <= points; i += 1) {
      const t = i / points;
      const angle = t * Math.PI * 2 * layer.frequency + time;
      const r = radius * (0.4 + t * 0.72) * (1 + Math.sin(angle * 0.7) * 0.08);
      const x = cx + Math.cos(angle + layer.twist * t) * r;
      const y = cy + Math.sin(angle) * r * (0.42 + musicState.climax * 0.22);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawGenomeOrbit(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, layer: VisualLayer, musicState: MusicState): void {
    const count = Math.max(2, Math.floor(layer.symmetry / 2));
    for (let i = 0; i < count; i += 1) {
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        radius * (1.2 + i * 0.18 + musicState.climax * 0.24),
        radius * (0.32 + i * 0.08 + musicState.climax * 0.1),
        time * 0.2 + i * Math.PI / count + layer.twist,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  drawGenomeRibbon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, _layer: VisualLayer, musicState: MusicState): void {
    ctx.beginPath();
    const width = radius * (2.2 + musicState.climax * 0.6);
    ctx.moveTo(cx - width, cy + Math.sin(time) * radius * 0.22);
    ctx.bezierCurveTo(
      cx - width * 0.42,
      cy - radius * (0.7 + musicState.climax * 0.7),
      cx + width * 0.42,
      cy + radius * (0.7 + musicState.climax * 0.7),
      cx + width,
      cy + Math.cos(time * 0.8) * radius * 0.22
    );
    ctx.stroke();
  }

  drawGenomeLattice(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, layer: VisualLayer, musicState: MusicState): void {
    const count = layer.symmetry + 4;
    const height = radius * (0.8 + musicState.climax * 1.2);
    for (let i = 0; i < count; i += 1) {
      const x = cx + ((i / (count - 1)) * 2 - 1) * radius * 1.8;
      const wobble = Math.sin(time + i * layer.frequency) * radius * 0.16;
      ctx.beginPath();
      ctx.moveTo(x + wobble, cy - height * (0.35 + (i % 3) * 0.16));
      ctx.lineTo(x - wobble, cy + height * (0.35 + ((i + 1) % 3) * 0.16));
      ctx.stroke();
    }
  }

  drawGenomeBloom(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, layer: VisualLayer, musicState: MusicState): void {
    const petals = layer.symmetry + 3;
    ctx.beginPath();
    for (let i = 0; i <= petals * 18; i += 1) {
      const t = (i / (petals * 18)) * Math.PI * 2;
      const petal = Math.sin(t * petals + time) * 0.32 + 0.78 + musicState.climax * 0.16;
      const x = cx + Math.cos(t) * radius * petal;
      const y = cy + Math.sin(t) * radius * petal * 0.68;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawGenomeWave(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, layer: VisualLayer, musicState: MusicState): void {
    const lanes = 2 + Math.floor(layer.symmetry / 3);
    for (let lane = 0; lane < lanes; lane += 1) {
      ctx.beginPath();
      const offset = (lane - (lanes - 1) / 2) * radius * 0.22;
      for (let x = cx - radius * 2.2; x <= cx + radius * 2.2; x += 14) {
        const t = (x - cx) / radius;
        const y = cy + offset + Math.sin(t * layer.frequency + time + lane) * radius * (0.12 + musicState.climax * 0.24);
        if (x === cx - radius * 2.2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  drawGenomeDrift(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, time: number, layer: VisualLayer, musicState: MusicState): void {
    ctx.beginPath();
    const points = 90;
    for (let i = 0; i <= points; i += 1) {
      const t = i / points;
      const angle = t * Math.PI * 2 + time;
      const x = cx + Math.cos(angle * layer.frequency) * radius * (0.8 + musicState.climax * 0.4);
      const y = cy + Math.sin(angle + layer.twist) * radius * (0.35 + musicState.climax * 0.25);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawNoteSparks(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const bandWidth = Math.min(this.width * 0.55, 740);
    const bandHeight = Math.max(70, this.height * 0.16);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const spark of this.noteSparks) {
      const life = 1 - spark.age / spark.life;
      const x = centerX + spark.x * bandWidth;
      const y = centerY + spark.y * bandHeight;
      const radius = 2 + spark.power * 5 + analysis.high * 5;
      ctx.globalAlpha = clamp(life * (0.42 + spark.power * 0.52), 0, 1);
      ctx.fillStyle = spark.color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(spark.color, 0.28 * life);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 32 * life, y);
      ctx.lineTo(x + 32 * life, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRings(ctx: CanvasRenderingContext2D): void {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ring of this.rings) {
      const t = ring.age / 1.1;
      const radiusX = Math.min(this.width * 0.45, 560) * t * (0.65 + ring.power * 0.35);
      const radiusY = Math.max(32, this.height * 0.1) * t * (0.8 + ring.power * 0.4);
      ctx.globalAlpha = clamp((1 - t) * (0.34 + ring.power * 0.26), 0, 0.9);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCore(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const palette = this.getRenderPalette();
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const radius = Math.min(this.width, this.height) * (0.058 + analysis.low * 0.012 + this.bassPush * 0.014);
    const spin = this.time * (0.18 + this.track.energy * 0.16 + this.sparkPulse * 0.12);

    ctx.save();
    ctx.strokeStyle = rgba(palette[2] || "#b8c7ad", 0.12 + analysis.mid * 0.12 + this.bassPush * 0.1);
    ctx.lineWidth = 1 + this.bassPush * 0.8;
    ctx.globalCompositeOperation = "lighter";

    for (let lat = -3; lat <= 3; lat += 1) {
      const scaleY = Math.cos((lat / 4) * Math.PI * 0.5);
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * scaleY, spin * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let lon = 0; lon < 8; lon += 1) {
      const angle = spin + (lon / 8) * Math.PI;
      const radiusX = Math.max(radius * Math.abs(Math.cos(angle)), 0.5);
      ctx.beginPath();
      ctx.ellipse(cx, cy, radiusX, radius, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = rgba(palette[1] || "#cfd8c5", 0.18 + analysis.high * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (0.9 + analysis.level * 0.12), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawRain(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const palette = this.getRenderPalette();
    ctx.save();
    ctx.strokeStyle = rgba(palette[2] || "#a9b6c9", 0.035 + analysis.high * 0.075);
    ctx.lineWidth = 1;
    const drift = (this.time * 72) % 68;
    for (let x = this.width * 0.32; x < this.width * 0.68; x += 24) {
      for (let y = this.height * 0.36; y < this.height * 0.62; y += 68) {
        const px = x + Math.sin(y * 0.02 + this.time) * 8;
        const py = y + drift;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + 10, py + 30);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawRailPulse(ctx: CanvasRenderingContext2D, analysis: MusicState): void {
    const palette = this.getRenderPalette();
    ctx.save();
    const center = this.width * 0.5;
    const y = this.height * 0.5;
    ctx.strokeStyle = rgba(palette[3] || "#c9b18c", 0.06 + analysis.low * 0.16);
    ctx.lineWidth = 1 + analysis.low * 2;
    for (let i = 0; i < 6; i += 1) {
      const t = ((this.time * 0.34 + i / 6) % 1) * 2 - 1;
      const x = center + t * this.width * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, y - 62);
      ctx.lineTo(x + t * 90, y + 62);
      ctx.stroke();
    }
    ctx.restore();
  }

}
