"use client";

import { ErrorBox } from "@/components/ErrorBox";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorBox title="This page couldn't load" message="Something failed on our side. Your data is safe. Try again, and if it keeps happening, check the Vercel logs." />
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
      {error.digest && <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>}
    </div>
  );
}
