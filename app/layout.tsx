import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppStateProvider } from "@/lib/app-state";

// The three faces of the team's websityer look, self-hosted by next/font so the
// app still works offline: Plus Jakarta Sans for text, Space Grotesk for
// titles and answer words, JetBrains Mono for small labels.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-jetbrains",
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
  themeColor: "#0a0a0a",
};

// Runs before paint so the stored text size never flashes. The look is dark
// only, so the dark class is always set.
const bootScript = `(function(){try{
document.documentElement.classList.add("dark");
var s=localStorage.getItem("scamshield.text");
if(s)document.documentElement.setAttribute("data-text",s);
}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${grotesk.variable} ${jetbrains.variable} dark font-sans`}
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
