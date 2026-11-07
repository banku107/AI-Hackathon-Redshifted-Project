// lib/agent/investigate.ts  (Person 1)
// The ONE place the brain gets its investigation tools from.
//
// Today: temporary fakes (lib/agent/fake-investigate.ts).
// When Person 2's tools are ready (P1-7), replace the line below with:
//   export * from "@/lib/investigate";
// and run `npm run typecheck`. Nothing else needs to change.

export * from "./fake-investigate";
