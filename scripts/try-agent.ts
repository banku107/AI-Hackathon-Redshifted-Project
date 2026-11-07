// scripts/try-agent.ts  (Person 1)
// Sends one message to the running app and prints the live updates.
//
//   npm run try:agent -- usps                 (a demo case by name)
//   npm run try:agent -- "any message text"   (your own text, English)
//
// Needs `npm run dev` running. BASE_URL defaults to http://localhost:3000.

import type { AgentEvent, AgentRequest } from "@/lib/contract";
import { DEMO_CASES } from "./demo-cases";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export async function runCheck(
  request: AgentRequest,
  onEvent: (e: AgentEvent) => void = () => {},
): Promise<AgentEvent[]> {
  const res = await fetch(`${BASE_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const events: AgentEvent[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      if (!chunk.startsWith("data: ")) continue;
      const e = JSON.parse(chunk.slice(6)) as AgentEvent;
      events.push(e);
      onEvent(e);
    }
  }
  return events;
}

export function printEvent(e: AgentEvent) {
  switch (e.type) {
    case "plan":
      console.log(`PLAN: ${e.steps.join(" | ")}`);
      break;
    case "step_start":
      console.log(`  > ${e.label}`);
      break;
    case "step_done":
      console.log(`    ${e.ok ? "ok" : "!!"} ${e.summary}`);
      break;
    case "evidence":
      console.log(`    [${e.severity}] ${e.finding}`);
      break;
    case "verdict": {
      const v = e.verdict;
      console.log(`\nVERDICT: ${v.level.toUpperCase()} (${Math.round(v.confidence * 100)}%, ${v.scamType}) - ${v.headline}`);
      v.reasons.forEach((r) => console.log(`  - ${r}`));
      console.log("  Next:");
      v.nextSteps.forEach((n) => console.log(`  * ${n}`));
      if (v.officialContact) console.log(`  Official contact: ${JSON.stringify(v.officialContact)}`);
      if (v.aiMedia) console.log(`  AI media: ${JSON.stringify(v.aiMedia)}`);
      break;
    }
    case "family_alert":
      console.log(`\nFAMILY ALERT -> ${e.alert.contactName} (${e.result.channel}, delivered=${e.result.delivered}): ${e.alert.summary}`);
      break;
    case "damage_control":
      console.log("\nDAMAGE CONTROL:");
      e.plan.steps.forEach((st, i) => console.log(`  ${i + 1}. ${st.urgent ? "[URGENT] " : ""}${st.title}: ${st.detail}`));
      e.plan.report.forEach((r) => console.log(`  Report to ${r.agency}: ${r.url}`));
      break;
    case "error":
      console.log(`ERROR: ${e.message}`);
      break;
    case "done":
      console.log("DONE");
      break;
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log(`Usage: npm run try:agent -- <${DEMO_CASES.map((c) => c.key).join("|")}|"message text">`);
    process.exit(1);
  }
  const demo = DEMO_CASES.find((c) => c.key === arg);
  const request: AgentRequest = demo ? demo.request : { language: "en", text: arg };
  const started = Date.now();
  await runCheck(request, printEvent);
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/try-agent.ts")) void main();
