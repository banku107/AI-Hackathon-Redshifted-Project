import { join } from "node:path";

export const LOCAL_VIDEO_DIRECTORY = join(process.cwd(), ".uploads");

export const VIDEO_CONTENT_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
} as const;

export type VideoContentType = keyof typeof VIDEO_CONTENT_TYPES;

const videoIdSchema = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp4|mov|webm)$/i;
const extensionContentTypes = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
} as const;

export function createLocalVideoId(id: string, contentType: VideoContentType): string {
  return `${id}.${VIDEO_CONTENT_TYPES[contentType]}`;
}

export function resolveLocalVideoId(
  value: string,
): { path: string; mimeType: VideoContentType } | null {
  const match = videoIdSchema.exec(value);
  if (!match) return null;

  const fileName = `${match[1].toLowerCase()}.${match[2].toLowerCase()}`;
  const extension = match[2].toLowerCase() as keyof typeof extensionContentTypes;
  return {
    path: join(LOCAL_VIDEO_DIRECTORY, fileName),
    mimeType: extensionContentTypes[extension],
  };
}
