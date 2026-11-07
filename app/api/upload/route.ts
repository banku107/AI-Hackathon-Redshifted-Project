import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  createLocalVideoId,
  LOCAL_VIDEO_DIRECTORY,
  type VideoContentType,
} from "@/lib/investigate/localVideo";
import { browserRequestUrl, isLocalNetworkHost } from "@/lib/investigate/localNetwork";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_AGE_MS = 60 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 120_000;
const contentTypeSchema = z.enum(["video/mp4", "video/quicktime", "video/webm"]);
const storedFileSchema = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm)$/i;

function isSameOriginLocalRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = browserRequestUrl(request);
    const originUrl = new URL(origin);
    return originUrl.origin === requestUrl.origin
      && isLocalNetworkHost(requestUrl.hostname)
      && (requestUrl.protocol === "http:" || requestUrl.protocol === "https:");
  } catch {
    return false;
  }
}

function hasExpectedSignature(header: Buffer, contentType: VideoContentType): boolean {
  if (contentType === "video/webm") {
    return header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (header.length < 12 || header.toString("ascii", 4, 8) !== "ftyp") return false;
  const isQuickTime = header.toString("ascii", 8, 12) === "qt  ";
  return contentType === "video/quicktime" ? isQuickTime : !isQuickTime;
}

async function removeExpiredUploads(): Promise<void> {
  const entries = await readdir(LOCAL_VIDEO_DIRECTORY, { withFileTypes: true });
  const now = Date.now();
  await Promise.all(entries
    .filter((entry) => entry.isFile() && storedFileSchema.test(entry.name))
    .map(async (entry) => {
      const path = join(LOCAL_VIDEO_DIRECTORY, entry.name);
      const details = await stat(path);
      if (now - details.mtimeMs > MAX_AGE_MS) await rm(path, { force: true });
    }));
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginLocalRequest(request)) {
    return jsonError("Uploads are only accepted from this local app.", 403);
  }

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const parsedContentType = contentTypeSchema.safeParse(contentType);
  if (!parsedContentType.success) {
    return jsonError("Upload must be an MP4, QuickTime, or WebM video.", 415);
  }
  const mimeType: VideoContentType = parsedContentType.data;

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
      return jsonError("Invalid upload size.", 400);
    }
    if (Number(contentLength) > MAX_FILE_BYTES) {
      return jsonError("Video exceeds the 50 MB limit.", 413);
    }
  }
  if (!request.body) return jsonError("Upload body is empty.", 400);

  const videoId = createLocalVideoId(randomUUID(), mimeType);
  const path = join(/*turbopackIgnore: true*/ LOCAL_VIDEO_DIRECTORY, videoId);
  let bytesWritten = 0;
  let exceededLimit = false;

  try {
    await mkdir(LOCAL_VIDEO_DIRECTORY, { recursive: true, mode: 0o700 });
    await removeExpiredUploads();

    const sizeLimit = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesWritten += buffer.length;
        if (bytesWritten > MAX_FILE_BYTES) {
          exceededLimit = true;
          callback(new Error("Upload exceeds the configured size limit."));
          return;
        }
        callback(null, buffer);
      },
    });
    await pipeline(
      Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>),
      sizeLimit,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
      { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) },
    );

    if (bytesWritten === 0) {
      await rm(path, { force: true });
      return jsonError("Upload body is empty.", 400);
    }
    const file = await open(/*turbopackIgnore: true*/ path, "r");
    let header: Buffer;
    try {
      header = Buffer.alloc(12);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      header = header.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
    if (!hasExpectedSignature(header, mimeType)) {
      await rm(path, { force: true });
      return jsonError("Video content does not match its declared type.", 415);
    }

    return Response.json(
      { videoId, contentType: mimeType, size: bytesWritten },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await rm(path, { force: true });
    if (exceededLimit) return jsonError("Video exceeds the 50 MB limit.", 413);
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
      return jsonError("Video upload timed out.", 408);
    }
    return jsonError("Could not save the video upload.", 500);
  }
}
