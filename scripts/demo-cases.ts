// scripts/demo-cases.ts  (Person 1)
// The stage demo messages (from the team guide) and what they should return.
// Person 4 can replace the USPS link with the team's real lookalike domain.

import type { AgentRequest, VerdictLevel } from "@/lib/contract";

export interface DemoCase {
  key: string;
  request: AgentRequest;
  expect: { level: VerdictLevel; familyAlert?: boolean; damageControl?: boolean };
}

const JAIL_EN = "Grandma it's me, I'm in jail, please send $2,000 in gift cards, don't tell mom";
const JAIL_ES =
  "Abuela soy yo, estoy en la cárcel, por favor mándame $2,000 en tarjetas de regalo, no le digas a mamá";

export const DEMO_CASES: DemoCase[] = [
  {
    key: "bank",
    request: {
      language: "en",
      text: "Chase: Did you attempt a $42.10 purchase at Target? Reply YES or NO. We'll never ask for your password.",
    },
    expect: { level: "safe" },
  },
  {
    key: "usps",
    request: {
      language: "en",
      text: "USPS: Your package is on hold due to an incomplete address. Update within 12 hrs: https://usps-redeliver-help.xyz/track",
    },
    expect: { level: "scam" },
  },
  {
    key: "jail",
    request: { language: "en", text: JAIL_EN, familyContact: { name: "Maria" } },
    expect: { level: "scam", familyAlert: true },
  },
  {
    key: "jail_es",
    request: { language: "es", text: JAIL_ES, familyContact: { name: "Maria" } },
    expect: { level: "scam", familyAlert: true },
  },
  {
    key: "jail_acted",
    request: {
      language: "en",
      text: JAIL_EN,
      alreadyActed: true,
      actionDetails: "I already sent one $500 gift card",
      familyContact: { name: "Maria" },
    },
    expect: { level: "scam", damageControl: true },
  },
];
