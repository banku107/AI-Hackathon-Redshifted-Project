import { join } from "node:path";
import { tmpdir } from "node:os";

export const LOCAL_VIDEO_DIRECTORY = join(tmpdir(), "scamshield-video-uploads");

export const VIDEO_CONTENT_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
} as const;

export type VideoContentType = keyof typeof VIDEO_CONTENT_TYPES;

const extensionContentTypes = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
} as const;

export function createLocalVideoReference(id: string, contentType: VideoContentType): string {
  return `scamshield-local://video/${id}.${VIDEO_CONTENT_TYPES[contentType]}`;
}

export function resolveLocalVideoReference(
  value: string,
): { path: string; mimeType: VideoContentType } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "scamshield-local:"
    || url.hostname !== "video"
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    return null;
  }

  const match = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp4|mov|webm)$/i
    .exec(url.pathname);
  if (!match) return null;

  const extension = match[2].toLowerCase() as keyof typeof extensionContentTypes;
  return {
    path: join(LOCAL_VIDEO_DIRECTORY, `${match[1]}.${extension}`),
    mimeType: extensionContentTypes[extension],
  };
}
