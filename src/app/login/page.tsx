import type { Metadata } from "next";
import { Logo } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export const metadata: Metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="-mt-20 flex min-h-[calc(100dvh-8rem)] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="reveal mb-8 flex flex-col items-center text-center">
          <Logo size={60} />
          <h1 className="mt-6">Welcome back, Arjun</h1>
          <p className="mt-2 text-muted">Your shortlist is waiting. Log in to review candidates.</p>
        </div>
        <form action="/api/login" method="post" className="card reveal space-y-5 p-8" style={{ "--i": 2 } as React.CSSProperties}>
          <input type="hidden" name="next" value={next ?? "/"} />
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold">Password</label>
            <input id="password" name="password" type="password" autoFocus required placeholder="Your dashboard password" className="input" autoComplete="current-password" aria-describedby={error ? "login-error" : undefined} aria-invalid={error === "1" || error === "locked" ? true : undefined} />
          </div>
          {error === "1" && <p id="login-error" role="alert" className="rounded-2xl bg-clay-50 px-4 py-3 text-sm text-clay-700">That password didn&apos;t match. Check it and try again.</p>}
          {error === "locked" && <p id="login-error" role="alert" className="rounded-2xl bg-clay-50 px-4 py-3 text-sm text-clay-700">Too many wrong passwords from this connection. Wait 15 minutes and try again.</p>}
          {error === "config" && <p id="login-error" role="alert" className="rounded-2xl bg-clay-50 px-4 py-3 text-sm text-clay-700">DASHBOARD_PASSWORD isn&apos;t set on the server. Add it in Vercel and redeploy.</p>}
          <button className="btn-cta w-full">
            Log in
            <span className="btn-dot"><Icon name="arrowUpRight" size={16} /></span>
          </button>
        </form>
        <p className="reveal mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted" style={{ "--i": 4 } as React.CSSProperties}>
          <Icon name="lock" size={14} /> Holds candidates&apos; personal data. Nothing is sent without your click.
        </p>
      </div>
    </div>
  );
}
