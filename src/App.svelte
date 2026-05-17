<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { AudioEngine } from "./lib/audio";
  import { loadQuote } from "./lib/api";
  import type { Quote } from "./lib/types";
  import { formatQuote } from "./lib/tracks";

  const SCENES = [
    "/images/main.webp",
    "/images/jazz.webp",
    "/images/pomodro.webp",
    "/images/sleep.webp",
    "/images/synthwave.webp",
    "/images/cozy-cat-cafe-with-coffee.webp",
    "/images/lofi-girl-college-scholarships-1920x1131.webp",
    "/images/469076083_orig.webp"
  ];

  const AUDIO_TRACKS = [
    "/audio/aventure-lofi-chill-nostalgic-469629.mp3",
    "/audio/bfcmusic-lofi-lo-fi-511230.mp3",
    "/audio/delosound-lofi-lofi-chill-lofi-girl-456265.mp3",
    "/audio/delosound-lofi-lofi-chill-lofi-girl-466467.mp3",
    "/audio/delosound-lofi-lofi-chill-lofi-girl-471138.mp3",
    "/audio/desifreemusic-cozy-lofi-background-music-for-relax-study-amp-sleep-453302.mp3",
    "/audio/freemusicforvideo-lofi-chill-music-495628.mp3",
    "/audio/leberch-lofi-vlog-525299.mp3",
    "/audio/lemonmusiclab-lofi-beat-relax-499261.mp3",
    "/audio/lofi_music_library-coffee-lofi-chill-lofi-ambient-458901.mp3",
    "/audio/lofi_music_library-lofi-girl-chill-lofi-beats-lofi-ambient-461871.mp3",
    "/audio/lofi_music_library-rainy-lofi-city-lofi-music-458076.mp3",
    "/audio/mondamusic-lofi-lofi-girl-lofi-music-529555.mp3",
    "/audio/prettyjohn1-lofi-523178.mp3",
    "/audio/prettyjohn1-lofi-chill-chill_38sec-490468.mp3",
    "/audio/pulsebox-lofi-melody-522894.mp3",
    "/audio/pulsebox-lofi-mood-522871.mp3",
    "/audio/pulsebox-lofi-night-522890.mp3",
    "/audio/pulsebox-lofi-vinyl-522882.mp3",
    "/audio/vibehorn-lofi-chill-background-461490.mp3"
  ];

  let status = "";
  let isReady = false;
  let isPlaying = false;
  let sceneIndex = 0;
  let audioIndex = 0;
  let storyLine = "";
  let storyVisible = false;
  let audio: AudioEngine;
  let quoteRequestId = 0;

  function setQuote(quote: Quote | null | undefined): void {
    storyLine = formatQuote(quote);
  }

  function refreshQuote(): void {
    const requestId = ++quoteRequestId;
    loadQuote().then((quote) => {
      if (requestId !== quoteRequestId) return;
      setQuote(quote);
      storyVisible = true;
    });
  }

  async function startExperience(): Promise<void> {
    await audio.init();
    if (!audio.isPlaying) throw new Error("Autoplay blocked");
    audio.setVolume(0.55);
    isReady = true;
    isPlaying = true;
    status = "";
    document.body.classList.remove("needs-audio");
  }

  async function tryAutoplay(): Promise<void> {
    try {
      await startExperience();
    } catch {
      document.body.classList.add("needs-audio");
      status = "Click anywhere to enable sound";
    }
  }

  function unlockAudioOnce(): void {
    if (isReady) return;
    startExperience().catch(() => {
      document.body.classList.add("needs-audio");
      status = "Click play button to enable sound";
    });
  }

  async function togglePlayback(): Promise<void> {
    if (!isReady) {
      await startExperience();
      return;
    }
    if (audio.isPlaying) {
      audio.pause();
      isPlaying = false;
    } else {
      await audio.play();
      isPlaying = audio.isPlaying;
    }
  }

  function switchPreset(): void {
    sceneIndex = (sceneIndex + 1) % SCENES.length;
    audioIndex = (audioIndex + 1) % AUDIO_TRACKS.length;

    if (isReady) audio.setTrack(AUDIO_TRACKS[audioIndex]);

    storyVisible = false;
    const requestId = ++quoteRequestId;

    Promise.all([
      loadQuote(),
      new Promise<void>((resolve) => setTimeout(resolve, 700))
    ]).then(([quote]) => {
      if (requestId !== quoteRequestId) return;
      setQuote(quote);
      storyVisible = true;
    });
  }

  onMount(() => {
    try {
      audio = new AudioEngine();
      audio.setTrack(AUDIO_TRACKS[audioIndex]);
    } catch (error) {
      console.error("Wolpsflow startup failed", error);
      status = "Failed to start page, please refresh or check console";
      document.body.classList.add("needs-audio");
      return;
    }

    refreshQuote();

    window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
    const autoplayTimer = window.setTimeout(tryAutoplay, 120);

    return () => {
      window.clearTimeout(autoplayTimer);
      window.removeEventListener("pointerdown", unlockAudioOnce);
    };
  });

  onDestroy(() => {
    audio?.dispose();
  });
</script>

<div class="scene-stage" aria-hidden="true">
  {#each SCENES as src, index}
    <div
      class="scene-layer"
      class:is-active={index === sceneIndex}
      style:background-image="url({src})"
    ></div>
  {/each}
  <div class="scene-tint"></div>
</div>

<main class="interface" aria-label="Wolpsflow music space">
  <header class="story-panel">
    <div class="station-line">
      <button
        class:is-playing={isPlaying}
        class="tiny-icon"
        id="playButton"
        type="button"
        title="Play or pause"
        aria-label={isPlaying ? "Pause" : "Play"}
        on:click={togglePlayback}
      >
        <svg class="play-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="m8 5 11 7-11 7V5Z" />
        </svg>
        <svg class="pause-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 5v14" />
          <path d="M16 5v14" />
        </svg>
      </button>
      <strong>Wolpsflow</strong>
    </div>

    <p id="storyLine" class="story-text" class:visible={storyVisible}>{storyLine}</p>
  </header>

  <button class="next-link" id="nextButton" type="button" on:click={switchPreset}>
    Next
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  <span class="status-line" id="remixStatus" aria-live="polite">{status}</span>
</main>
