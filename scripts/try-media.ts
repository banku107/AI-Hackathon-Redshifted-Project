// scripts/try-media.ts  (Person 1)
// Sends a screenshot (or images pretending to be video frames) to the agent.
//
//   npm run try:media -- screenshot path/to/image.png
//   npm run try:media -- video frame1.jpg frame2.jpg ...
//
// "video" mode uses a fake blob URL, so it tests the brain's video handling
// with Person 2's stand-in video checks. Needs `npm run dev` running.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { AgentRequest, InputImage } from "@/lib/contract";
import { printEvent, runCheck } from "./try-agent";

function load(path: string): InputImage {
  const ext = extname(path).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { mediaType, base64: readFileSync(path).toString("base64") };
}

async function main() {
  const [mode, ...paths] = process.argv.slice(2);
  if (!["screenshot", "video"].includes(mode) || paths.length === 0) {
    console.log("Usage: npm run try:media -- <screenshot|video> <image files...>");
    process.exit(1);
  }
  const images = paths.map(load);
  const request: AgentRequest =
    mode === "screenshot"
      ? { language: "en", images }
      : {
          language: "en",
          video: {
            blobUrl: "https://example.com/test-video.mp4",
            frames: images,
            frameTimes: images.map((_, i) => i * 2),
            durationSec: images.length * 2,
            fileName: "test-video.mp4",
          },
        };
  const started = Date.now();
  await runCheck(request, printEvent);
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

void main();
