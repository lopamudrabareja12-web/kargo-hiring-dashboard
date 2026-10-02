"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Brand";
import { Icon, type IconName } from "./Icons";

const LINKS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Shortlist", icon: "list", match: (p) => p === "/" || p.startsWith("/candidates") },
  { href: "/upload", label: "Upload CVs", icon: "upload", match: (p) => p.startsWith("/upload") },
  { href: "/rubric", label: "Rubric", icon: "book", match: (p) => p.startsWith("/rubric") },
];

export function NavBar() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-3 pt-4">
      <nav aria-label="Main" className="glass-nav pointer-events-auto flex w-full max-w-5xl items-center gap-1 rounded-full py-1.5 pl-2.5 pr-1.5 sm:gap-2">
        <Link href="/" className="mr-1 flex items-center gap-2.5 rounded-full pr-2 no-underline sm:mr-3" aria-label="Kargo Hiring, home">
          <Logo size={34} />
          <span className="hidden leading-tight sm:block">
            <span className="block whitespace-nowrap font-display text-[1.05rem] font-semibold text-ink">Kargo Hiring</span>
            <span className="hidden whitespace-nowrap text-[11px] text-muted lg:block">The system recommends. Arjun decides.</span>
          </span>
        </Link>
        <div className="flex flex-1 items-center justify-center gap-0.5 sm:justify-start">
          {LINKS.map((l) => {
            const active = l.match(path);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-medium no-underline transition duration-500 ease-spring active:scale-[0.97] ${
                  active ? "bg-leaf-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" : "text-muted hover:bg-sand hover:text-ink"
                }`}
              >
                <Icon name={l.icon} size={17} />
                <span className={active ? "" : "sr-only sm:not-sr-only"}>{l.label}</span>
              </Link>
            );
          })}
        </div>
        <span className="hidden text-sm text-muted md:inline">Hi, Arjun</span>
        <form action="/api/logout" method="post">
          <button className="flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm text-muted transition duration-500 ease-spring hover:bg-sand hover:text-ink active:scale-[0.97]">
            <Icon name="logout" size={17} />
            <span className="sr-only sm:not-sr-only">Log out</span>
          </button>
        </form>
      </nav>
    </header>
  );
}
