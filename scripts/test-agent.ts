// scripts/test-agent.ts  (Person 1)
// Offline tests for the brain: no Claude calls, no cost.
// Run:  npm run test:agent

import type { AgentEvent, AgentRequest, Verdict } from "@/lib/contract";
import { AgentEventSchema, AgentRequestSchema } from "@/lib/agent/schemas";
import { TOOLS, checkVerdict, createSession, deliverVerdict, runTool } from "@/lib/agent/tools";
import { pickRecording } from "@/lib/agent/demo";
import mocks from "@/mock/mock-events.json";
import recordings from "@/mock/demo-recording.json";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}`, detail ?? "");
  }
}

function session(req: Partial<AgentRequest> = {}) {
  const sent: AgentEvent[] = [];
  const s = createSession({ language: "en", text: "test", ...req }, (e) => sent.push(e));
  return { s, sent };
}

const scamVerdict: Verdict = {
  level: "scam",
  confidence: 0.95,
  headline: "This is a scam.",
  reasons: ["Asks for gift cards.", "Asks for secrecy."],
  nextSteps: ["Do not reply."],
  scamType: "grandparent",
  aiMedia: { level: "likely_real", signals: ["No signs of AI were found."], flaggedFrames: [] },
};

async function main() {
  // 1. Mock and recorded events match the contract
  for (const [name, list] of Object.entries(mocks as Record<string, unknown[]>)) {
    const bad = list.map((e) => AgentEventSchema.safeParse(e)).filter((r) => !r.success);
    check(`mock-events.json "${name}" matches AgentEvent`, bad.length === 0, bad[0]?.error?.issues);
    check(`mock-events.json "${name}" ends with done`, (list.at(-1) as { type?: string })?.type === "done");
  }
  for (const [name, list] of Object.entries(recordings as Record<string, unknown[]>)) {
    const bad = list.map((e) => AgentEventSchema.safeParse(e)).filter((r) => !r.success);
    check(`demo-recording.json "${name}" matches AgentEvent`, bad.length === 0, bad[0]?.error?.issues);
    const types = list.map((e) => (e as { type: string }).type);
    check(`demo-recording.json "${name}" has a verdict`, types.includes("verdict"));
  }

  // 2. Request validation
  check("request: empty request rejected", !AgentRequestSchema.safeParse({ language: "en" }).success);
  check("request: text request accepted", AgentRequestSchema.safeParse({ language: "en", text: "hi" }).success);
  check("request: demo request accepted without text", AgentRequestSchema.safeParse({ language: "en", demo: true }).success);
  check(
    "request: data: prefix rejected",
    !AgentRequestSchema.safeParse({ language: "en", images: [{ mediaType: "image/png", base64: "data:image/png;base64,AAA" }] }).success,
  );
  check("request: unknown language rejected", !AgentRequestSchema.safeParse({ language: "xx", text: "hi" }).success);

  // 3. Tool definitions are valid
  for (const t of TOOLS) {
    if (!("input_schema" in t)) continue;
    const schema = t.input_schema as Record<string, unknown>;
    check(`tool ${t.name}: object schema without $schema`, schema.type === "object" && !("$schema" in schema));
  }
  const names = TOOLS.map((t) => ("name" in t ? t.name : t.type));
  check("tools: names are unique", new Set(names).size === names.length);

  // 4. Verdict rules
  {
    const { s } = session();
    check("verdict: rejected with no evidence", checkVerdict(s, scamVerdict).length > 0);
    s.evidence.push({ id: "message", finding: "gift cards", severity: "red" });
    check("verdict: scam with 1 red rejected", checkVerdict(s, scamVerdict).some((p) => p.includes("2 red")));
    s.evidence.push({ id: "message", finding: "secrecy", severity: "red" });
    check("verdict: scam with 2 red accepted", checkVerdict(s, scamVerdict).length === 0, checkVerdict(s, scamVerdict));
    // The second answer, "Made by AI?", is required on every check.
    const { aiMedia: _omit, ...noAi } = scamVerdict;
    void _omit;
    check("verdict: missing AI answer rejected", checkVerdict(s, noAi).some((p) => p.includes("aiMedia")));
    check(
      "verdict: AI answer without a reason rejected",
      checkVerdict(s, { ...scamVerdict, aiMedia: { level: "unclear", signals: [], flaggedFrames: [] } }).length > 0,
    );
    check(
      "verdict: flagged frames without a video rejected",
      checkVerdict(s, {
        ...scamVerdict,
        aiMedia: { level: "likely_ai", signals: ["warped hands"], flaggedFrames: [{ index: 0, note: "hands" }] },
      }).some((p) => p.includes("only for video")),
    );
    check(
      "verdict: safe with red evidence rejected",
      checkVerdict(s, { ...scamVerdict, level: "safe", scamType: "none" }).length > 0,
    );
  }
  {
    const { s } = session({ text: "Call us now at 1-888-555-0199 or visit usps-help-now.com" });
    s.evidence.push({ id: "m", finding: "a", severity: "red" }, { id: "m", finding: "b", severity: "red" });
    const fromMessage = checkVerdict(s, {
      ...scamVerdict,
      scamType: "delivery",
      officialContact: { org: "USPS", phone: "(888) 555-0199" },
    });
    check("verdict: phone number from the message is rejected", fromMessage.some((p) => p.includes("phone")));
    const urlFromMessage = checkVerdict(s, {
      ...scamVerdict,
      scamType: "delivery",
      officialContact: { org: "USPS", url: "https://usps-help-now.com/track" },
    });
    check("verdict: website from the message is rejected", urlFromMessage.some((p) => p.includes("url")));
    const official = checkVerdict(s, {
      ...scamVerdict,
      scamType: "delivery",
      officialContact: { org: "USPS", phone: "1-800-275-8777", url: "https://www.usps.com" },
    });
    check("verdict: official contact accepted", official.length === 0, official);
  }
  {
    const { s } = session({ alreadyActed: true, actionDetails: "sent a gift card" });
    s.evidence.push({ id: "m", finding: "a", severity: "red" }, { id: "m", finding: "b", severity: "red" });
    check("verdict: already acted needs damage_control", checkVerdict(s, scamVerdict).some((p) => p.includes("damage_control")));
  }
  {
    const { s } = session({ familyContact: { name: "Maria" } });
    s.evidence.push({ id: "m", finding: "a", severity: "red" }, { id: "m", finding: "b", severity: "red" });
    check("verdict: family contact prompts alert_family once", checkVerdict(s, scamVerdict).some((p) => p.includes("alert_family")));
  }

  // 5. Running tools and event order
  {
    const { s, sent } = session({ familyContact: { name: "Maria", phone: "+15551234567" }, alreadyActed: true });
    await runTool(s, "make_plan", { steps: ["Read it", "Check it"] });
    const bad = await runTool(s, "record_evidence", { finding: "x", severity: "purple" });
    check("tool: invalid input returns an error", bad.isError === true && bad.content.includes("INVALID_INPUT"));
    await runTool(s, "record_evidence", { finding: "Gift cards", severity: "red" });
    await runTool(s, "record_evidence", { finding: "Secrecy", severity: "red" });
    const fam = await runTool(s, "alert_family", {
      summary: "Scam text",
      riskLevel: "scam",
      moneyInvolved: true,
      suggestedAction: "Call her",
    });
    check("tool: alert_family does not leak contact details to Claude", !fam.content.includes("5551234567"));
    await runTool(s, "damage_control", {
      plan: {
        steps: [
          { title: "Later", detail: "Report it", urgent: false },
          { title: "Now", detail: "Call the card company", urgent: true },
        ],
        report: [{ agency: "FTC", url: "https://reportfraud.ftc.gov", prefilledText: "I received..." }],
      },
    });
    const first = await runTool(s, "give_verdict", { verdict: { ...scamVerdict, reasons: ["one"] } });
    check("tool: give_verdict with problems is sent back", first.isError === true && s.verdict === null);
    const ok = await runTool(s, "give_verdict", { verdict: scamVerdict });
    check("tool: give_verdict accepted", !ok.isError && s.verdict !== null, ok);
    check("tool: no verdict event before delivery", !sent.some((e) => e.type === "verdict"));
    deliverVerdict(s);
    const types = sent.map((e) => e.type);
    const vi = types.indexOf("verdict");
    check("events: plan comes first", types[0] === "plan");
    check(
      "events: family_alert and damage_control come after the verdict",
      vi > -1 && types.indexOf("family_alert") > vi && types.indexOf("damage_control") > vi,
      types,
    );
    const dc = sent.find((e) => e.type === "damage_control");
    check("events: urgent damage steps first", dc?.type === "damage_control" && dc.plan.steps[0].urgent);
    const opened = sent.filter((e) => e.type === "step_start").map((e) => (e as { id: string }).id);
    const closed = sent.filter((e) => e.type === "step_done").map((e) => (e as { id: string }).id);
    check("events: every step is closed", opened.every((id) => closed.includes(id)), { opened, closed });
    check(
      "events: all valid AgentEvents",
      sent.every((e) => AgentEventSchema.safeParse(e).success),
    );
  }
  {
    const { s } = session({ language: "es" });
    const r = await runTool(s, "lookalike_check", { domain: "usps-redelivery-help.com" });
    check("tool: lookalike stand-in flags usps-redelivery-help.com", JSON.parse(r.content).impersonates === "usps.com");
    const real = await runTool(s, "lookalike_check", { domain: "tools.usps.com" });
    check("tool: lookalike stand-in does not flag tools.usps.com", JSON.parse(real.content).impersonates === null);
    const unknown = await runTool(s, "not_a_tool", {});
    check("tool: unknown tool returns an error", unknown.isError === true);
  }

  {
    const { s, sent } = session();
    s.afterPlan.push({ type: "step_start", id: "video", label: "Checking the video file" });
    await runTool(s, "make_plan", { steps: ["Check the video", "Check the claim"] });
    check("events: Claude's plan comes before the video step", sent[0]?.type === "plan" && sent[0].steps[0] === "Check the video" && sent[1]?.type === "step_start");
    await runTool(s, "damage_control", {
      plan: {
        steps: [{ title: "Call", detail: "Call the bank", urgent: true }],
        report: [
          { agency: "FTC", url: "https://reportfraud.ftc.gov", prefilledText: "x" },
          { agency: "gift_card_company", url: "[number on the back of the card]", prefilledText: "x" },
        ],
      },
    });
    const dc = s.damageControlEvent;
    check("tool: damage_control drops reports without a real web address", dc?.type === "damage_control" && dc.plan.report.length === 1);
  }

  // 6. Demo picker
  check("demo: bank text gets a safe run", pickRecording({ language: "en", text: "Chase: did you attempt a purchase?" }).some((e) => e.type === "verdict" && e.verdict.level === "safe"));
  check("demo: jail text gets a scam run", pickRecording({ language: "en", text: "Grandma it's me, I'm in jail" }).some((e) => e.type === "verdict" && e.verdict.level === "scam"));

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
