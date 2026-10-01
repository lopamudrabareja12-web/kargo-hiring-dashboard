export function ErrorBox({ title = "Something went wrong", message, retryHref }: { title?: string; message: string; retryHref?: string }) {
  return (
    <div className="rounded-3xl border border-clay-100 bg-clay-50 p-6 text-clay-700">
      <p className="flex items-center gap-2 font-semibold"><span aria-hidden>⚠️</span>{title}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm">{message}</p>
      {retryHref && <a href={retryHref} className="btn mt-4 no-underline">Try again</a>}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
