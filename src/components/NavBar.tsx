"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Brand";

const LINKS = [
  { href: "/", label: "Shortlist", match: (p: string) => p === "/" || p.startsWith("/candidates") },
  { href: "/upload", label: "Upload CVs", match: (p: string) => p.startsWith("/upload") },
  { href: "/rubric", label: "Rubric", match: (p: string) => p.startsWith("/rubric") },
];

export function NavBar() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-cream/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-3">
        <Link href="/" className="mr-4 flex items-center gap-2.5 no-underline">
          <Logo size={34} />
          <span className="leading-tight">
            <span className="block whitespace-nowrap font-display text-[1.05rem] font-semibold text-ink">Kargo Hiring</span>
            <span className="hidden text-[11px] text-muted lg:block">The system recommends. Arjun decides.</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 rounded-full border border-line/70 bg-white p-1 shadow-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium no-underline transition ${
                l.match(path) ? "bg-leaf-600 text-white shadow-sm" : "text-muted hover:bg-leaf-50 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">Hi, Arjun 👋</span>
          <form action="/api/logout" method="post">
            <button className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-sand hover:text-ink">Log out</button>
          </form>
        </div>
      </nav>
    </header>
  );
}
