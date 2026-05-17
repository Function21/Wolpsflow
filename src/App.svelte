<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { AudioEngine } from "./lib/audio";
  import { loadQuote } from "./lib/api";
  import { StoryVisualizer } from "./lib/visualizer";
  import type { Quote, Track } from "./lib/types";
  import {
    NEXT_PROMPTS,
    PRESET_TRACKS,
    createTrackFromPrompt,
    formatQuote,
    mergePrompt,
    normalizeTrack,
    pickPromptAccent
  } from "./lib/tracks";

  let canvas: HTMLCanvasElement;
  let status = "";
  let isReady = false;
  let isPlaying = false;
  let currentIndex = 0;
  let remixCount = 0;
  let currentTrack = normalizeTrack(PRESET_TRACKS[0]);
  let storyLine = "Loading a quiet thought...";
  let audio: AudioEngine;
  let visualizer: StoryVisualizer;
  let quoteRequestId = 0;

  function setQuote(quote: Quote | null | undefined): void {
    storyLine = formatQuote(quote);
  }

  function hydrateTrack(track: Track): void {
    currentTrack = normalizeTrack(track);
    if (currentTrack.quote) setQuote(currentTrack.quote);
  }

  function refreshQuote(): void {
    const requestId = ++quoteRequestId;
    loadQuote()
      .then((quote) => {
        if (requestId !== quoteRequestId) return;
        currentTrack = { ...currentTrack, quote };
        setQuote(quote);
      })
      .catch((error) => {
        console.error("Failed to load quote:", error);
        if (requestId === quoteRequestId) {
          setQuote(null);
        }
      });
  }

  async function startExperience(): Promise<void> {
    await audio.init();
    audio.setTrack(currentTrack);
    audio.setVolume(0.5);
    audio.play();
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
      audio.play();
      isPlaying = true;
    }
  }

  function switchPreset(): void {
    currentIndex = (currentIndex + 1) % NEXT_PROMPTS.length;
    remixCount += 1;
    const promptSeed = NEXT_PROMPTS[currentIndex];
    const nextPrompt = mergePrompt(promptSeed, pickPromptAccent(remixCount));
    const nextTrack = createTrackFromPrompt(nextPrompt, remixCount, currentTrack, "next");
    nextTrack.quote = currentTrack.quote;
    applyTrack(nextTrack, "");
    refreshQuote();
  }


  function applyTrack(track: Track, nextStatus: string): void {
    hydrateTrack(track);
    visualizer.setTrack(currentTrack);

    if (isReady) {
      audio.setTrack(currentTrack);
      if (!audio.isPlaying) {
        audio.play();
        isPlaying = true;
      }
    }

    status = nextStatus;
  }



  onMount(() => {
    try {
      audio = new AudioEngine();
      visualizer = new StoryVisualizer(canvas, audio);
    } catch (error) {
      console.error("Wolpsflow startup failed", error);
      status = "Failed to start page, please refresh or check console";
      document.body.classList.add("needs-audio");
      return;
    }

    hydrateTrack(currentTrack);
    visualizer.setTrack(currentTrack);
    visualizer.start();

    refreshQuote();

    window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
    const autoplayTimer = window.setTimeout(tryAutoplay, 120);

    return () => {
      window.clearTimeout(autoplayTimer);
      window.removeEventListener("pointerdown", unlockAudioOnce);
      visualizer.destroy();
    };
  });

  onDestroy(() => {
    audio?.dispose();
  });
</script>

<canvas bind:this={canvas} id="visualizer" aria-hidden="true"></canvas>
<div class="screen-tint" aria-hidden="true"></div>

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

    <p id="storyLine" class="story-text">{storyLine}</p>
  </header>


  <button class="next-link" id="nextButton" type="button" on:click={switchPreset}>
    Next
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  <span class="status-line" id="remixStatus" aria-live="polite">{status}</span>
</main>
