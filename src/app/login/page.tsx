export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1>Log in</h1>
      <p className="mt-1 text-sm text-neutral-600">This dashboard holds candidates&apos; personal data.</p>
      <form action="/api/login" method="post" className="mt-5 space-y-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <input name="password" type="password" autoFocus required placeholder="Password" className="input" autoComplete="current-password" />
        {error === "1" && <p className="text-sm text-red-700">Wrong password.</p>}
        {error === "config" && <p className="text-sm text-red-700">DASHBOARD_PASSWORD is not set on the server. Add it in Vercel and redeploy.</p>}
        <button className="btn-primary w-full justify-center">Log in</button>
      </form>
    </div>
  );
}
