// lib/agent/events.ts  (Person 1)
// Turns AgentEvents into a Server-Sent Events stream for the browser.
// Each event is written as one line:  data: <JSON>\n\n

import type { AgentEvent } from "@/lib/contract";

export interface EventStream {
  stream: ReadableStream<Uint8Array>;
  send: (e: AgentEvent) => void;
  close: () => void;
  /** True once the browser disconnected or close() was called. */
  readonly closed: boolean;
  /** Every event sent so far (used to record demo runs). */
  readonly history: AgentEvent[];
}

export function createEventStream(): EventStream {
  const encoder = new TextEncoder();
  const history: AgentEvent[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // The browser went away (tab closed, network lost).
      closed = true;
    },
  });

  return {
    stream,
    get closed() {
      return closed;
    },
    history,
    send(e) {
      if (closed || !controller) return;
      history.push(e);
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      } catch {
        closed = true;
      }
    },
    close() {
      if (closed || !controller) return;
      closed = true;
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  };
}

export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
