import { Context, Reader } from "@contentauth/c2pa-node";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { AnalyzeVideo, VideoReport } from "@/lib/contract";
import { resolveLocalVideoReference } from "@/lib/investigate/localVideo";

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path: string };
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const FFPROBE_TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const inputSchema = z.string().trim().min(1).max(2048);
const ffprobeSchema = z.object({
  streams: z.array(z.object({
    codec_type: z.string().optional(),
    codec_name: z.string().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    avg_frame_rate: z.string().optional(),
    tags: z.record(z.string(), z.unknown()).optional(),
  }).passthrough()).optional(),
  format: z.object({
    duration: z.string().optional(),
    format_name: z.string().optional(),
    tags: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
}).passthrough();

class VideoInputError extends Error {}

function failedReport(message: string): VideoReport {
  return {
    credentials: { found: false, error: message },
    metadata: { clues: [], hasCameraInfo: false, error: message },
    detector: null,
  };
}

function publicBlobUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VideoInputError("The Blob URL is invalid.");
  }
  const configuredHost = process.env.BLOB_HOSTNAME?.trim().toLowerCase().replace(/\.$/, "");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const isVercelBlobHost = hostname.endsWith(".public.blob.vercel-storage.com");
  if (!configuredHost) throw new VideoInputError("BLOB_HOSTNAME is not configured.");
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.pathname === "/"
    || !isVercelBlobHost
    || hostname !== configuredHost
  ) {
    throw new VideoInputError("The URL is not on the configured trusted Vercel Blob host.");
  }
  return url;
}

async function downloadBlob(url: URL, directory: string): Promise<{ path: string; mimeType: string }> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Blob download failed (HTTP ${response.status}).`);

  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!mimeType || !ALLOWED_CONTENT_TYPES.has(mimeType)) {
    throw new Error("The Blob does not contain a supported video type.");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_FILE_BYTES)) {
    throw new Error("The video exceeds the 50 MB size limit or has an invalid size.");
  }
  if (!response.body) throw new Error("The Blob response has no video content.");

  const path = join(directory, "source-video");
  let bytesWritten = 0;
  const sizeLimit = new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesWritten += buffer.length;
      if (bytesWritten > MAX_FILE_BYTES) {
        callback(new Error("The video exceeds the 50 MB size limit."));
        return;
      }
      callback(null, buffer);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
    sizeLimit,
    createWriteStream(path, { flags: "wx" }),
  );
  if (bytesWritten === 0) throw new Error("The Blob contains an empty video.");
  return { path, mimeType };
}

function cleanText(value: string, maxLength = 200): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function collectDigitalSourceTypes(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (item: unknown, depth: number, budget: { count: number }) => {
    if (depth > 12 || budget.count >= 2_000 || item === null || typeof item !== "object") return;
    budget.count += 1;
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1, budget);
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      if (key === "digitalSourceType" && typeof child === "string") found.add(cleanText(child));
      visit(child, depth + 1, budget);
    }
  };
  visit(value, 0, { count: 0 });
  return [...found].slice(0, 20);
}

async function analyzeC2pa(path: string, mimeType: string): Promise<VideoReport["credentials"]> {
  try {
    const reader = await Reader.fromAsset(
      { path, mimeType },
      new Context({
        verify: {
          remoteManifestFetch: false,
          verifyTrust: false,
          ocspFetch: false,
        },
      }),
    );
    if (!reader || !reader.isEmbedded()) {
      return {
        found: false,
        error: "No C2PA credentials were found; their absence does not prove the video is authentic.",
      };
    }

    const active = reader.getActive();
    if (!active) return { found: true, error: "C2PA credentials exist, but no active manifest claim was available." };

    const generators = active.claim_generator_info
      ?.map((item) => item.name)
      .filter((name) => typeof name === "string" && name.trim());
    const generator = cleanText(generators?.join(", ") || active.claim_generator || "");
    const assertions = active.assertions ?? [];
    const sourceTypes = collectDigitalSourceTypes(assertions);
    const claims = [
      ...assertions.map((assertion) => cleanText(assertion.label, 150)).filter(Boolean),
      ...sourceTypes,
    ].slice(0, 30);
    if (sourceTypes.some((sourceType) => sourceType.includes("trainedAlgorithmicMedia"))) {
      claims.push("An AI-related trainedAlgorithmicMedia source type is declared.");
    }
    return {
      found: true,
      ...(generator ? { generator } : {}),
      ...(claims.length > 0 ? { claims } : {}),
    };
  } catch {
    return { found: false, error: "C2PA credentials could not be read from this video." };
  }
}

function getTag(tags: Record<string, unknown> | undefined, ...names: string[]): string | undefined {
  if (!tags) return undefined;
  for (const name of names) {
    const entry = Object.entries(tags).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    if (typeof entry === "string" && entry.trim()) return cleanText(entry);
  }
  return undefined;
}

function analyzeWithFfprobe(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobeStatic.path,
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path],
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) reject(error);
        else {
          try {
            resolve(JSON.parse(stdout));
          } catch (parseError) {
            reject(parseError);
          }
        }
      },
    );
  });
}

async function analyzeMetadata(path: string): Promise<VideoReport["metadata"]> {
  try {
    const parsed = ffprobeSchema.safeParse(await analyzeWithFfprobe(path));
    if (!parsed.success) {
      return { clues: [], hasCameraInfo: false, error: "ffprobe returned invalid video metadata." };
    }

    const formatTags = parsed.data.format?.tags;
    const videoStreams = (parsed.data.streams ?? []).filter((stream) => stream.codec_type === "video");
    const streamTags = videoStreams.map((stream) => stream.tags);
    const tags = [formatTags, ...streamTags];
    const make = tags.map((entry) => getTag(entry, "make", "com.apple.quicktime.make")).find(Boolean);
    const model = tags.map((entry) => getTag(entry, "model", "com.apple.quicktime.model")).find(Boolean);
    const encoder = tags.map((entry) => getTag(entry, "encoder")).find(Boolean);
    const creationTool = tags.map((entry) => getTag(entry, "software", "writing_application")).find(Boolean);
    const creationTimes = tags
      .map((entry) => getTag(entry, "creation_time", "com.apple.quicktime.creationdate"))
      .filter((value): value is string => Boolean(value));
    const clues: string[] = [];

    if (make || model) {
      clues.push(`Camera metadata identifies ${[make, model].filter(Boolean).join(" ")}.`);
    } else {
      clues.push("No camera make or model was present; many legitimate videos omit this metadata.");
    }
    if (encoder) clues.push(`The file lists ${encoder} as its encoder.`);
    if (creationTool) clues.push(`The metadata names ${creationTool} as the creation software.`);
    if (creationTimes.length > 0) clues.push(`The metadata reports creation time ${creationTimes[0]}.`);
    const parsedTimes = creationTimes.map(Date.parse).filter(Number.isFinite);
    if (parsedTimes.length > 1 && Math.max(...parsedTimes) - Math.min(...parsedTimes) > 5 * 60 * 1000) {
      clues.push("The file and video stream report inconsistent creation timestamps.");
    }
    const stream = videoStreams[0];
    if (stream) {
      const dimensions = stream.width && stream.height ? `${stream.width} × ${stream.height}` : undefined;
      const detail = [stream.codec_name, dimensions, stream.avg_frame_rate ? `${stream.avg_frame_rate} fps` : undefined]
        .filter(Boolean)
        .join(", ");
      if (detail) clues.push(`Video stream details: ${detail}.`);
    } else {
      clues.push("No video stream was identified in the file.");
    }

    return {
      clues,
      ...(encoder ? { encoder } : {}),
      ...(creationTool ? { creationTool } : {}),
      hasCameraInfo: Boolean(make || model),
    };
  } catch {
    return {
      clues: [],
      hasCameraInfo: false,
      error: "Video metadata could not be read; missing metadata alone does not mean the video is fake.",
    };
  }
}

async function analyzeDetector(): Promise<VideoReport["detector"]> {
  try {
    if (!process.env.DETECTOR_API_KEY?.trim()) return null;
    return {
      provider: "Unconfigured",
      aiProbability: 0,
      error: "The AI-video detector provider has not been selected or configured.",
    };
  } catch {
    return {
      provider: "Unconfigured",
      aiProbability: 0,
      error: "The AI-video detector is unavailable.",
    };
  }
}

async function analyzeVideoFile(path: string, mimeType: string): Promise<VideoReport> {
  const [credentials, metadata, detector] = await Promise.all([
    analyzeC2pa(path, mimeType),
    analyzeMetadata(path),
    analyzeDetector(),
  ]);
  return { credentials, metadata, detector };
}

export const analyzeVideo: AnalyzeVideo = async (blobUrl) => {
  const fallback = failedReport("Video analysis could not be completed.");
  try {
    const validated = inputSchema.safeParse(blobUrl);
    if (!validated.success) return failedReport("The Blob URL is empty or too long.");
    const localVideo = resolveLocalVideoReference(validated.data);
    if (localVideo) {
      try {
        const details = await stat(localVideo.path);
        if (!details.isFile() || details.size === 0 || details.size > MAX_FILE_BYTES) {
          throw new VideoInputError("The local video is empty or exceeds the 50 MB limit.");
        }
        return await analyzeVideoFile(localVideo.path, localVideo.mimeType);
      } catch (error) {
        const message = error instanceof VideoInputError
          ? error.message
          : "The local video upload is unavailable or invalid.";
        return { ...failedReport(message), detector: await analyzeDetector() };
      } finally {
        await rm(localVideo.path, { force: true });
      }
    }

    const url = publicBlobUrl(validated.data);
    const directory = await mkdtemp(join(tmpdir(), "scamshield-video-"));
    try {
      const { path, mimeType } = await downloadBlob(url, directory);
      return await analyzeVideoFile(path, mimeType);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The trusted Blob could not be analyzed.";
      return { ...failedReport(message), detector: await analyzeDetector() };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } catch (error) {
    if (error instanceof VideoInputError) return failedReport(error.message);
    return fallback;
  }
};
