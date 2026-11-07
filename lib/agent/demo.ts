// lib/agent/demo.ts  (Person 1)
// Demo mode: picks a recorded run to replay when the internet (or the API)
// can't be trusted on stage. Recordings are made with scripts/record-demo.ts.

import type { AgentEvent, AgentRequest } from "@/lib/contract";
import recordings from "@/mock/demo-recording.json";
import mocks from "@/mock/mock-events.json";

type Recordings = Record<string, AgentEvent[]>;
const recorded = recordings as unknown as Recordings;
const mock = mocks as unknown as { scam: AgentEvent[]; safe: AgentEvent[] };

/** Matches a request to the closest recorded demo. */
export function pickRecording(request: AgentRequest): AgentEvent[] {
  const text = `${request.text ?? ""}`.toLowerCase();
  const isJail = /jail|c[aá]rcel|grandma|abuela/.test(text);
  const isUsps = /usps|package|paquete/.test(text);

  let key: string;
  if (isJail && request.alreadyActed) key = "jail_acted";
  else if (isJail) key = request.language === "es" ? "jail_es" : "jail";
  else if (isUsps) key = "usps";
  else key = "bank";

  const pick = recorded[key] ?? (key === "jail_es" ? recorded.jail : undefined);
  if (pick?.length) return pick;
  return key === "bank" ? mock.safe : mock.scam;
}
