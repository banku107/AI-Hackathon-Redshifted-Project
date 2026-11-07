import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AppStateProvider } from "@/lib/app-state";

// Atkinson Hyperlegible was drawn by the Braille Institute for low-vision
// readers: every letterform is shaped so it cannot be confused with a
// neighbour. That is exactly the audience this app is for.
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

// The one display face: the greeting and the verdict word, set large. Every
// sentence a person has to read stays in Atkinson Hyperlegible.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScamShield",
  description:
    "Check a suspicious message, picture, or video and get a plain answer about whether it is a scam.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1412" },
  ],
};

// Runs before paint so the stored theme and text size never flash.
const bootScript = `(function(){try{
var t=localStorage.getItem("scamshield.theme");
var dark=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
if(dark)document.documentElement.classList.add("dark");
var s=localStorage.getItem("scamshield.text");
if(s)document.documentElement.setAttribute("data-text",s);
}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${atkinson.variable} ${instrumentSerif.variable} font-sans`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-[100dvh] antialiased">
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
