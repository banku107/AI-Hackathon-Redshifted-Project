// scripts/accuracy-cases.ts  (Person 1)
// A small extra test set Person 1 uses to check the brain's accuracy before
// Person 4's full test set exists. "accept" lists the answers that count as
// correct. A real message called "scam" is a FALSE ALARM (the worst mistake).

import type { AgentRequest, VerdictLevel } from "@/lib/contract";

export interface AccuracyCase {
  id: string;
  isReal: boolean; // true = a genuine, harmless message
  accept: VerdictLevel[];
  request: AgentRequest;
}

const en = (text: string): AgentRequest => ({ language: "en", text });

export const ACCURACY_CASES: AccuracyCase[] = [
  // Scams
  { id: "tech-support", isReal: false, accept: ["scam"], request: en("MICROSOFT SECURITY ALERT: Your computer is infected with a virus and your bank details are at risk. Call Microsoft Support at 1-888-555-0123 immediately. Do not turn off your computer.") },
  { id: "irs-gift-cards", isReal: false, accept: ["scam"], request: en("IRS NOTICE: You owe $3,200 in back taxes. Pay today using Google Play gift cards or a warrant will be issued for your arrest. Call 202-555-0188.") },
  { id: "romance-bitcoin", isReal: false, accept: ["scam"], request: en("My love, I am stuck at the airport in Lagos. Customs is holding my bags and I need $800 for the fee. Please send it through the Bitcoin ATM at the gas station, I will pay you back as soon as I land. Don't tell your kids, they won't understand us.") },
  { id: "prize-shipping", isReal: false, accept: ["scam"], request: en("Congratulations! You have won a $1,000 Walmart gift card. Claim it now at walmart-rewards-claim.top and pay only $4.99 shipping. Offer expires in 2 hours!") },
  { id: "crypto-doubling", isReal: false, accept: ["scam"], request: en("Official Elon Musk Bitcoin giveaway! Send any amount from 0.1 to 5 BTC to the address below and we will send back DOUBLE instantly. Limited time only. Address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh") },
  { id: "bank-locked", isReal: false, accept: ["scam"], request: en("Wells Fargo: Your account has been locked due to unusual activity. Verify your identity at wellsfargo-secure-login.info within 24 hours or your account will be closed.") },
  { id: "medicare-card", isReal: false, accept: ["scam", "suspicious"], request: en("Medicare: You are eligible for a new plastic Medicare card with a chip. To avoid losing your benefits, reply with your Medicare number and date of birth today.") },
  // Unclear
  { id: "wrong-number", isReal: false, accept: ["suspicious", "scam"], request: en("Hi, is this John? We met at the wine event last week. It was so nice talking with you!") },
  // Real, harmless messages
  { id: "google-code", isReal: true, accept: ["safe"], request: en("G-482913 is your Google verification code. Don't share it with anyone.") },
  { id: "grandkid-normal", isReal: true, accept: ["safe"], request: en("Hi Grandma! Just landed safe in Denver. I'll call you tonight after dinner. Love you! - Sam") },
  { id: "doctor-reminder", isReal: true, accept: ["safe"], request: en("Reminder: You have an appointment with Dr. Patel on Tuesday, Nov 12 at 10:30 AM. Reply C to confirm or R to reschedule.") },
  { id: "pharmacy-ready", isReal: true, accept: ["safe"], request: en("CVS Pharmacy: Your prescription is ready for pickup at your CVS store. Bring your ID. Reply STOP to opt out.") },
];
