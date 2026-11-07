// Recorded runs for the "Try an example" buttons.
//
// The files in mock/ belong to Person 1 and are the same recordings the API
// replays in demo mode, so a demo button and a real check tell the same story.
// This module only adds the friendly names for the buttons on the home screen.

import type { AgentEvent } from "./contract";
import mockEvents from "@/mock/mock-events.json";
import recordings from "@/mock/demo-recording.json";

export type MockScenario = "jail" | "usps" | "safe";

const recorded = recordings as unknown as Record<string, AgentEvent[]>;
const mocks = mockEvents as unknown as { scam: AgentEvent[]; safe: AgentEvent[] };

export const MOCK_STREAMS: Record<MockScenario, AgentEvent[]> = {
  // A grandchild-in-jail message: the classic grandparent scam.
  jail: recorded.jail?.length ? recorded.jail : mocks.scam,
  // A fake USPS delivery text. This run shows the tools disagreeing.
  usps: recorded.usps?.length ? recorded.usps : mocks.scam,
  // A real Chase fraud alert, so the app is seen saying "this looks real".
  safe: recorded.bank?.length ? recorded.bank : mocks.safe,
};

export const DEMO_BUTTONS: { scenario: MockScenario; label: string; note: string }[] = [
  { scenario: "jail", label: "A text from family", note: "Someone says your grandchild is in trouble" },
  { scenario: "usps", label: "A delivery text", note: "A link about a package you never sent" },
  { scenario: "safe", label: "A real bank alert", note: "See it say a message is fine" },
];
