// Handles the browser's request for a Vercel Blob upload token.
//
// Only video is uploaded, and only short clips: the page pulls out the frames
// itself and sends those inline, so this route exists for the file checks the
// agent runs on the server (metadata, AI-video detection).
//
// Without BLOB_READ_WRITE_TOKEN the route answers 503. The browser then checks
// the frames alone and the screen says the file checks were skipped.

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
];

export async function POST(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Video uploads are not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: false,
      }),
    });
    return Response.json(result);
  } catch (error) {
    console.error("[upload] token refused", error);
    return Response.json({ error: "That video could not be accepted." }, { status: 400 });
  }
}
