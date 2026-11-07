// scripts/accuracy.ts  (Person 1)
// Runs the extra test set and prints a score.
//   npm run accuracy            (needs `npm run dev`; costs a few cents per case)

import type { AgentEvent } from "@/lib/contract";
import { ACCURACY_CASES } from "./accuracy-cases";
import { runCheck } from "./try-agent";

const PARALLEL = 3;

async function main() {
  const rows: { id: string; isReal: boolean; got: string; ok: boolean; seconds: number; headline: string }[] = [];
  const only = process.argv.slice(2);
  const queue = ACCURACY_CASES.filter((c) => only.length === 0 || only.includes(c.id));
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const started = Date.now();
      let events: AgentEvent[] = [];
      try {
        events = await runCheck(c.request);
      } catch (err) {
        console.error(c.id, err);
      }
      const v = events.find((e) => e.type === "verdict");
      const got = v?.type === "verdict" ? v.verdict.level : "no verdict";
      rows.push({
        id: c.id,
        isReal: c.isReal,
        got,
        ok: c.accept.includes(got as never),
        seconds: (Date.now() - started) / 1000,
        headline: v?.type === "verdict" ? v.verdict.headline : "",
      });
      console.log(`${c.accept.includes(got as never) ? "PASS" : "FAIL"}  ${c.id.padEnd(16)} expected ${c.accept.join("/").padEnd(17)} got ${got.padEnd(10)} ${((Date.now() - started) / 1000).toFixed(0)}s  ${v?.type === "verdict" ? v.verdict.headline : ""}`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const correct = rows.filter((r) => r.ok).length;
  const real = rows.filter((r) => r.isReal);
  const falseAlarms = real.filter((r) => r.got === "scam").length;
  const scams = rows.filter((r) => !r.isReal);
  const missed = scams.filter((r) => r.got === "safe").length;
  const avg = rows.reduce((a, r) => a + r.seconds, 0) / rows.length;
  console.log(
    `\nCorrect: ${correct}/${rows.length} | False alarms on real messages: ${falseAlarms}/${real.length} | Scams called safe: ${missed}/${scams.length} | Avg time: ${avg.toFixed(0)} s`,
  );
  process.exit(correct === rows.length ? 0 : 1);
}

void main();
