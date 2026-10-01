import { Logo } from "@/components/Brand";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4">Welcome back, Arjun</h1>
          <p className="mt-1 text-muted">Your shortlist is waiting. Log in to review candidates.</p>
        </div>
        <form action="/api/login" method="post" className="card space-y-4 p-8">
          <input type="hidden" name="next" value={next ?? "/"} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <input name="password" type="password" autoFocus required placeholder="Your dashboard password" className="input" autoComplete="current-password" />
          </label>
          {error === "1" && <p className="rounded-2xl bg-clay-50 px-4 py-2.5 text-sm text-clay-700">That password didn&apos;t match. Try again.</p>}
          {error === "config" && <p className="rounded-2xl bg-clay-50 px-4 py-2.5 text-sm text-clay-700">DASHBOARD_PASSWORD isn&apos;t set on the server. Add it in Vercel and redeploy.</p>}
          <button className="btn-primary w-full py-3 text-base">Log in</button>
        </form>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <span aria-hidden>🔒</span> This dashboard holds candidates&apos; personal data. Nothing is sent without your click.
        </p>
      </div>
    </div>
  );
}
