// Sends the reader's video to our own blob store before the check starts.
//
// The agent reads the file itself (ffprobe for metadata, a real AI-video
// detector), and both of those need a URL the server can reach. Frames still
// travel inline; the video is the part that has to live somewhere.
//
// The store may not be configured (local dev without BLOB_READ_WRITE_TOKEN).
// In that case this returns null and the check goes ahead on the frames alone.
// That is an honest degradation: the screen says the file checks were skipped.

import { upload } from "@vercel/blob/client";

export interface VideoUpload {
  url: string;
  pathname: string;
}

export async function uploadVideo(
  file: File,
  {
    onProgress,
    signal,
  }: { onProgress?: (percentage: number) => void; signal?: AbortSignal } = {},
): Promise<VideoUpload | null> {
  // A path the store accepts and a person cannot guess.
  const safeName =
    file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60) || "video";
  const pathname = `checks/${crypto.randomUUID()}-${safeName}`;

  try {
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: file.type || "video/mp4",
      multipart: false,
      abortSignal: signal,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage),
    });
    return { url: blob.url, pathname: blob.pathname };
  } catch {
    if (signal?.aborted) return null;
    // No token on this deployment, or the store refused it. Either way the
    // frames are enough to run a check, so do not block the reader.
    return null;
  }
}
