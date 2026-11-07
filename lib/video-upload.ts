// Sends the reader's video to our own server before the check starts.
//
// The agent reads the file itself (ffprobe for metadata, a real AI-video
// detector). POST /api/upload saves it as .uploads/<videoId> on this computer
// and answers { videoId }. Frames still travel inline.
//
// XMLHttpRequest, not fetch: only XHR reports upload progress.
//
// The route may not exist yet, or may refuse the file. Then this returns null
// and the check goes ahead on the frames alone. That is an honest degradation:
// the screen says only the pictures were checked.

export interface VideoUpload {
  videoId: string;
}

export function uploadVideo(
  file: File,
  {
    onProgress,
    signal,
  }: { onProgress?: (percentage: number) => void; signal?: AbortSignal } = {},
): Promise<VideoUpload | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return resolve(null);
      try {
        const body: unknown = JSON.parse(xhr.responseText);
        const videoId =
          body && typeof body === "object" && "videoId" in body
            ? (body as { videoId: unknown }).videoId
            : null;
        resolve(typeof videoId === "string" && videoId ? { videoId } : null);
      } catch {
        resolve(null);
      }
    };
    xhr.onerror = () => resolve(null);
    xhr.onabort = () => resolve(null);
    xhr.ontimeout = () => resolve(null);

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
