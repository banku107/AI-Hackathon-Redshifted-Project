// Reads the agent's live event stream.
//
// /api/agent speaks Server-Sent Events: each event is one `data: <JSON>` line
// followed by a blank line. Person 1 owns that route; this file owns the client
// side of it, and nothing else in the app talks to the network.

import type { AgentEvent, AgentRequest } from "./contract";

export interface StreamOptions {
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  /** Called when we switch to the recorded stream because the API failed. */
  onFallback?: (reason: string) => void;
}

export class StreamError extends Error {}

/** Splits an SSE chunk into events, keeping the unterminated tail for later. */
function drain(buffer: string, onEvent: (event: AgentEvent) => void): string {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    for (const line of part.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as AgentEvent);
      } catch {
        // A malformed frame is not fatal: the stream keeps going and the UI
        // still has whatever arrived before it.
      }
    }
  }

  return rest;
}

/**
 * Streams a real investigation. Throws StreamError when the request never got
 * going, so the caller can decide to fall back to a recording.
 */
export async function runAgent(
  request: AgentRequest,
  { signal, onEvent }: StreamOptions,
): Promise<void> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new StreamError(`The check did not start (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = drain(buffer, onEvent);
    }
    // Anything written without the closing blank line still counts.
    buffer = drain(`${buffer}\n\n`, onEvent);
  } finally {
    reader.releaseLock();
  }
}

/** Replays a recorded run with human-paced delays, for demo mode. */
export async function playMock(
  events: AgentEvent[],
  onEvent: (event: AgentEvent) => void,
  { signal, delayMs = 420 }: { signal?: AbortSignal; delayMs?: number } = {},
): Promise<void> {
  for (const event of events) {
    if (signal?.aborted) return;
    onEvent(event);
    const pause =
      event.type === "verdict" ? Math.round(delayMs * 0.8) : delayMs;
    await new Promise<void>((resolve) => {
      const id = window.setTimeout(resolve, pause);
      signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(id);
          resolve();
        },
        { once: true },
      );
    });
  }
}
