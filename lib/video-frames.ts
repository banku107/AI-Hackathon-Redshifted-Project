// Pulls still frames out of a video entirely in the browser.
//
// The video never leaves the device: drawing a <video> onto a canvas and
// exporting small JPEGs is what the agent needs for its vision input, and it
// keeps a stranger's video off our server.

import type { InputImage } from "./contract";
import { splitDataUrl } from "./image";

export interface FrameExtraction {
  frames: InputImage[];
  /** A data URL per frame, in the same order, for showing on screen. */
  previews: string[];
  frameTimes: number[];
  durationSec: number;
  width: number;
  height: number;
}

const MAX_FRAMES = 12;
const MIN_FRAMES = 8;
const MAX_EDGE = 768;
const JPEG_QUALITY = 0.8;

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      // One animation frame so the decoded picture is painted before we copy it.
      window.requestAnimationFrame(() => resolve());
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("We could not read this video. Try a different file."));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.addEventListener(
      "loadedmetadata",
      () => {
        // Some browsers report Infinity for fragmented mp4; clamp it.
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          cleanup();
          reject(new Error("This video has no readable length."));
          return;
        }
        resolve(video);
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error("This file could not be opened as a video."));
      },
      { once: true },
    );
  });
}

/**
 * Evenly samples the clip between 2% and 98% of its length, skipping the fade
 * in and fade out where an AI video usually gives nothing away.
 */
export async function extractFrames(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<FrameExtraction> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("That video is over 50 MB. Please trim it first.");
  }

  const video = await loadVideo(file);
  try {
    const durationSec = video.duration;
    if (durationSec > MAX_VIDEO_SECONDS) {
      throw new Error(
        `Please use a clip under ${MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(durationSec)}.`,
      );
    }

    const count = durationSec < 4 ? MIN_FRAMES : MAX_FRAMES;
    const start = durationSec * 0.02;
    const end = durationSec * 0.98;
    const step = (end - start) / Math.max(1, count - 1);

    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser blocked the picture.");

    const frames: InputImage[] = [];
    const previews: string[] = [];
    const frameTimes: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const time = Math.min(end, start + step * i);
      await seek(video, time);
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      frames.push(splitDataUrl(dataUrl));
      previews.push(dataUrl);
      frameTimes.push(time);
      onProgress?.((i + 1) / count);
    }

    return { frames, previews, frameTimes, durationSec, width, height };
  } finally {
    video.src = "";
  }
}
