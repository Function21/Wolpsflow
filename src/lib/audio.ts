export class AudioEngine {
  private audio: HTMLAudioElement;
  private targetVolume = 0.55;
  private fadeRaf: number | null = null;
  private currentSrc = "";

  isPlaying = false;

  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = this.targetVolume;
    this.audio.crossOrigin = "anonymous";
  }

  async init(): Promise<void> {
    if (!this.currentSrc) return;
    try {
      await this.audio.play();
      this.isPlaying = true;
    } catch {
      // Autoplay blocked; will retry on user gesture via play().
    }
  }

  setVolume(value: number): void {
    this.targetVolume = Math.max(0, Math.min(1, value));
    if (!this.fadeRaf) this.audio.volume = this.targetVolume;
  }

  async setTrack(url: string): Promise<void> {
    if (this.currentSrc === url) return;
    this.currentSrc = url;

    const wasPlaying = this.isPlaying && !this.audio.paused;
    if (wasPlaying) await this.fadeVolume(0, 600);

    this.audio.src = url;
    this.audio.load();

    if (this.isPlaying) {
      try {
        await this.audio.play();
        await this.fadeVolume(this.targetVolume, 800);
      } catch {
        this.isPlaying = false;
      }
    }
  }

  async play(): Promise<void> {
    if (!this.currentSrc) return;
    try {
      await this.audio.play();
      this.isPlaying = true;
      await this.fadeVolume(this.targetVolume, 400);
    } catch {
      this.isPlaying = false;
    }
  }

  pause(): void {
    this.isPlaying = false;
    this.audio.pause();
  }

  dispose(): void {
    if (this.fadeRaf !== null) cancelAnimationFrame(this.fadeRaf);
    this.audio.pause();
    this.audio.src = "";
  }

  private fadeVolume(target: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.fadeRaf !== null) cancelAnimationFrame(this.fadeRaf);
      const start = this.audio.volume;
      const startTime = performance.now();
      const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = t * t * (3 - 2 * t);
        this.audio.volume = start + (target - start) * eased;
        if (t < 1) {
          this.fadeRaf = requestAnimationFrame(tick);
        } else {
          this.fadeRaf = null;
          resolve();
        }
      };
      this.fadeRaf = requestAnimationFrame(tick);
    });
  }
}
