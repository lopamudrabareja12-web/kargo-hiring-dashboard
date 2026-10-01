import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Kargo Hiring", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-neutral-200">
          <nav className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-2.5 text-sm">
            <span className="font-semibold">Kargo Hiring</span>
            <Link href="/" className="hover:underline">Dashboard</Link>
            <Link href="/upload" className="hover:underline">Upload CVs</Link>
            <Link href="/rubric" className="hover:underline">Rubric</Link>
            <span className="ml-auto text-xs text-neutral-500">The system recommends. Arjun decides.</span>
            <form action="/api/logout" method="post">
              <button className="text-xs text-neutral-500 hover:underline">Log out</button>
            </form>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
