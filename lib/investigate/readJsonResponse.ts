const DEFAULT_MAX_BYTES = 1024 * 1024;

export class ResponseTooLargeError extends Error {}

export async function readJsonResponse(
  response: Response,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<unknown> {
  if (!response.body) throw new Error("Response has no body.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("JSON response size limit is invalid.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError("JSON response exceeded its size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
