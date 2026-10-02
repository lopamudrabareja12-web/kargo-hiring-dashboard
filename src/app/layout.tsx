import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display-face", display: "swap", axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  title: { default: "Kargo Hiring", template: "%s · Kargo Hiring" },
  description: "A ranked, explained shortlist for Kargo's Product Manager and Senior Product Manager roles. Arjun decides; nothing is sent without his click.",
  robots: { index: false, follow: false },
  openGraph: { title: "Kargo Hiring", description: "A shortlist Arjun can trust, with the reasoning behind every score.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#faf6ee" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <NavBar />
        <main id="main" className="mx-auto max-w-6xl px-5 pb-20 pt-28">{children}</main>
        <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-muted">
          Candidates&apos; personal details are split from their CV text before any AI step. Any candidate can be deleted from their page.
        </footer>
      </body>
    </html>
  );
}
