#!/usr/bin/env node
/**
 * ScamShield — screenshot fixture generator (Person 4 / test-data).
 *
 * Reads every test-data/messages/*.json case whose "image" field is set
 * (e.g. "screenshots/delivery-01.png") and writes a matching phone-style SVG
 * mockup next to it (delivery-01.svg). The SVG text is taken verbatim from the
 * JSON "text" field, so screenshot and test case always correspond exactly.
 *
 * Optional: --png renders each SVG to PNG with a locally installed
 * Chrome / Edge / Brave in headless mode (no network access needed).
 *
 * Usage (from the repository root):
 *   node test-data/screenshots/generate.mjs          # SVG only
 *   node test-data/screenshots/generate.mjs --png    # SVG + PNG
 *
 * Every mockup carries a visible "TEST FIXTURE" banner. They are fictional and
 * must never be presented as real communications from any institution.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const MESSAGES = resolve(HERE, "../messages");
const W = 390;
const H = 780;

// Visual presentation per case. Sender labels are fictional (555-01xx numbers / short codes).
const STYLE = {
  "grandparent-01": { kind: "sms", sender: "+1 (312) 555-0164", sub: "Unknown number" },
  "grandparent-04": { kind: "sms", sender: "+52 55 5555 0102", sub: "Número desconocido" },
  "delivery-01": { kind: "sms", sender: "+1 (415) 555-0138", sub: "Text Message" },
  "bank-01": { kind: "sms", sender: "73981", sub: "Text Message" },
  "government-02": { kind: "sms", sender: "+34 600 555 012", sub: "Mensaje de texto" },
  "legit-01": { kind: "sms", sender: "24273", sub: "Text Message" },
  "techsupport-01": { kind: "popup", sender: "Browser window", sub: "" },
};

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    // Hard-break very long tokens (URLs) so they never overflow the bubble.
    let word = w;
    while (word.length > maxChars) {
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

const BANNER = `
  <rect x="0" y="${H - 34}" width="${W}" height="34" fill="#111827"/>
  <text x="${W / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#fbbf24" font-weight="700" letter-spacing="0.5">TEST FIXTURE · FICTIONAL · NOT A REAL MESSAGE</text>`;

function smsSvg(c, st) {
  const lines = wrap(c.text, 30);
  const lh = 22;
  const bubbleH = lines.length * lh + 24;
  const tspans = lines.map((l, i) => `<tspan x="40" y="${200 + i * lh}">${esc(l)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <title>ScamShield test fixture ${esc(c.id)} (fictional)</title>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="120" fill="#f3f4f6"/>
  <text x="24" y="30" font-size="14" font-weight="600" fill="#111827">9:41</text>
  <text x="${W - 24}" y="30" font-size="13" text-anchor="end" fill="#111827">5G ▮▮▮</text>
  <text x="22" y="72" font-size="26" fill="#2563eb">‹</text>
  <circle cx="${W / 2}" cy="66" r="18" fill="#9ca3af"/>
  <text x="${W / 2}" y="72" text-anchor="middle" font-size="16" fill="#fff">👤</text>
  <text x="${W / 2}" y="100" text-anchor="middle" font-size="13" fill="#111827" font-weight="600">${esc(st.sender)}</text>
  <text x="${W / 2}" y="152" text-anchor="middle" font-size="11" fill="#6b7280">${esc(st.sub)} · Today 9:38 AM</text>
  <rect x="24" y="176" width="300" height="${bubbleH}" rx="18" fill="#e5e7eb"/>
  <text font-size="16" fill="#111827">${tspans}</text>
  <rect x="16" y="${H - 92}" width="${W - 32}" height="40" rx="20" fill="none" stroke="#d1d5db"/>
  <text x="34" y="${H - 66}" font-size="14" fill="#9ca3af">Text Message</text>${BANNER}
</svg>
`;
}

function popupSvg(c) {
  const lines = wrap(c.text, 34);
  const lh = 22;
  const tspans = lines.map((l, i) => `<tspan x="${W / 2}" y="${250 + i * lh}">${esc(l)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <title>ScamShield test fixture ${esc(c.id)} (fictional)</title>
  <rect width="${W}" height="${H}" fill="#1e3a8a"/>
  <rect x="0" y="0" width="${W}" height="44" fill="#e5e7eb"/>
  <rect x="12" y="10" width="${W - 24}" height="24" rx="12" fill="#ffffff"/>
  <text x="26" y="27" font-size="12" fill="#6b7280">security-alert.example</text>
  <rect x="20" y="150" width="${W - 40}" height="${lines.length * lh + 180}" rx="6" fill="#ffffff" stroke="#dc2626" stroke-width="4"/>
  <text x="${W / 2}" y="210" text-anchor="middle" font-size="40" fill="#dc2626">⚠</text>
  <text font-size="15" fill="#111827" text-anchor="middle" font-weight="600">${tspans}</text>
  <rect x="${W / 2 - 70}" y="${270 + lines.length * lh}" width="140" height="34" rx="4" fill="#dc2626"/>
  <text x="${W / 2}" y="${292 + lines.length * lh}" text-anchor="middle" font-size="14" fill="#fff" font-weight="700">OK</text>${BANNER}
</svg>
`;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const wantPng = process.argv.includes("--png");
const browser = wantPng ? findBrowser() : undefined;
if (wantPng && !browser) {
  console.error("No Chrome/Edge/Brave found. Set CHROME_PATH or convert the SVGs manually (see test-data/README.md).");
}

let count = 0;
for (const f of readdirSync(MESSAGES).filter((f) => f.endsWith(".json")).sort()) {
  const c = JSON.parse(readFileSync(join(MESSAGES, f), "utf8"));
  if (!c.image) continue;
  const st = STYLE[c.id] ?? { kind: "sms", sender: "+1 (555) 555-0100", sub: "Text Message" };
  const svg = st.kind === "popup" ? popupSvg(c) : smsSvg(c, st);
  const svgPath = join(HERE, `${c.id}.svg`);
  writeFileSync(svgPath, svg);
  count++;
  if (browser) {
    const pngPath = resolve(HERE, "..", c.image);
    execFileSync(browser, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      `--window-size=${W},${H}`, `--screenshot=${pngPath}`, pathToFileURL(svgPath).href,
    ], { stdio: "ignore", timeout: 30000 });
    console.log(`  ${c.id}: svg + png`);
  } else {
    console.log(`  ${c.id}: svg`);
  }
}
console.log(`Generated ${count} screenshot fixture(s).`);
