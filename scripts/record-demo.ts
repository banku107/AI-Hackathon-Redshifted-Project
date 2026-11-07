// scripts/record-demo.ts  (Person 1)
// Runs every stage demo through the real agent, checks the answers, and saves
// the runs to mock/demo-recording.json for demo mode (?demo=1 / DEMO_MODE).
//
//   npm run record:demo              run all demo cases
//   npm run record:demo -- usps bank only these cases
//   npm run record:demo -- --check   check only, don't save
//
// Needs `npm run dev` running. Uses the API key (about 1-2 cents per case).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent } from "@/lib/contract";
import { DEMO_CASES } from "./demo-cases";
import { printEvent, runCheck } from "./try-agent";

const FILE = join(process.cwd(), "mock", "demo-recording.json");

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const only = args.filter((a) => !a.startsWith("--"));
  const cases = DEMO_CASES.filter((c) => only.length === 0 || only.includes(c.key));

  const saved = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, AgentEvent[]>;
  let failed = 0;

  for (const c of cases) {
    console.log(`\n=== ${c.key} ===`);
    const started = Date.now();
    const events = await runCheck(c.request, printEvent);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const verdict = events.find((e) => e.type === "verdict");
    const problems: string[] = [];
    if (!verdict || verdict.type !== "verdict") problems.push("no verdict");
    else if (verdict.verdict.level !== c.expect.level) {
      problems.push(`expected ${c.expect.level}, got ${verdict.verdict.level}`);
    }
    if (c.expect.familyAlert && !events.some((e) => e.type === "family_alert")) problems.push("no family alert");
    if (c.expect.damageControl && !events.some((e) => e.type === "damage_control")) problems.push("no damage control");
    if (events[0]?.type !== "plan") problems.push("first event is not the plan");
    if (events.at(-1)?.type !== "done") problems.push("last event is not done");

    if (problems.length) {
      failed++;
      console.log(`RESULT ${c.key}: FAIL (${problems.join("; ")}) in ${seconds} s`);
      continue;
    }
    console.log(`RESULT ${c.key}: PASS in ${seconds} s`);
    if (!checkOnly) saved[c.key] = events.filter((e) => e.type !== "text");
  }

  if (!checkOnly) {
    writeFileSync(FILE, JSON.stringify(saved, null, 2) + "\n");
    console.log(`\nSaved passing runs to ${FILE}`);
  }
  console.log(failed === 0 ? "\nAll demo cases passed." : `\n${failed} demo case(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
