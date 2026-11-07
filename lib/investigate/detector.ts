// lib/investigate/detector.ts
// Free AI-image detector for videos: Sightengine's free plan has no video
// endpoint, so we score up to 4 of the still frames the browser already pulled
// from the video (VideoInput.frames) with the image model `genai`.
//
// Free plan: 2,000 ops/month, 500/day, 1 request per second. genai costs
// 5 ops per image, so one video (4 frames) is about 20 ops.
// Keys go in .env.local: DETECTOR_API_USER and DETECTOR_API_KEY
// (Sightengine dashboard > API keys: "API user" and "API secret").

import type { InputImage, VideoReport } from "@/lib/contract";

type Detector = VideoReport["detector"];

const ENDPOINT = "https://api.sightengine.com/1.0/check.json";
const PROVIDER = "Sightengine (free plan, 4 video frames)";
const MAX_FRAMES = 4;
const REQUEST_TIMEOUT_MS = 20_000;
const FREE_PLAN_GAP_MS = 1_100; // free plan allows 1 request per second

function credentials(): { user: string; secret: string } | null {
  const user = process.env.DETECTOR_API_USER?.trim();
  const secret = process.env.DETECTOR_API_KEY?.trim();
  return user && secret ? { user, secret } : null;
}

/** Up to `count` frames spread evenly across the video. */
export function pickFrames<T>(frames: T[], count = MAX_FRAMES): T[] {
  if (frames.length <= count) return frames;
  return Array.from({ length: count }, (_, i) => frames[Math.floor(((i + 0.5) * frames.length) / count)]);
}

function failure(error: string): Detector {
  return { provider: PROVIDER, aiProbability: 0, error };
}

async function scoreFrame(frame: InputImage, user: string, secret: string): Promise<number | string> {
  const form = new FormData();
  const bytes = Buffer.from(frame.base64, "base64");
  form.append("media", new Blob([new Uint8Array(bytes)], { type: frame.mediaType }), "frame.jpg");
  form.append("models", "genai");
  form.append("api_user", user);
  form.append("api_secret", secret);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as
      | { status?: string; type?: { ai_generated?: unknown }; error?: { message?: unknown } }
      | null;
    if (!response.ok || body?.status !== "success") {
      // 401 = wrong keys, 403 = not in plan, 429 = too many requests / daily limit.
      // Never include the keys in the message.
      return `The AI detector could not check the video (HTTP ${response.status}).`;
    }
    const score = Number(body.type?.ai_generated);
    if (!Number.isFinite(score) || score < 0 || score > 1) return "The AI detector returned no score.";
    return score;
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return name === "TimeoutError" || name === "AbortError"
      ? "The AI detector took too long to answer."
      : "The AI detector could not be reached.";
  }
}

/**
 * Scores the frames. Returns null when no keys are set (the contract's
 * "no detector configured"), and an `error` instead of a guess when a call
 * fails, so the agent says "couldn't check" rather than "looks real".
 * aiProbability is the highest frame score: one clearly AI-made frame is enough
 * to raise a flag, and the agent still needs a visual sign before "likely AI".
 */
export async function detectAiFrames(frames: InputImage[] | undefined): Promise<Detector> {
  const keys = credentials();
  if (!keys) return null;
  const chosen = pickFrames(frames ?? []);
  if (chosen.length === 0) return failure("No video frames were available for the AI detector.");

  const scores: number[] = [];
  for (const [i, frame] of chosen.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, FREE_PLAN_GAP_MS));
    let result = await scoreFrame(frame, keys.user, keys.secret);
    if (typeof result === "string") {
      // One retry after the free plan's 1-second gap: a network blip or a
      // rate-limit hit should not cost the "Made by AI?" answer.
      await new Promise((resolve) => setTimeout(resolve, FREE_PLAN_GAP_MS));
      result = await scoreFrame(frame, keys.user, keys.secret);
    }
    if (typeof result === "string") return failure(result);
    scores.push(result);
  }
  return { provider: PROVIDER, aiProbability: Math.max(...scores) };
}
