export function ErrorBox({ title = "Something went wrong", message, retryHref }: { title?: string; message: string; retryHref?: string }) {
  return (
    <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 whitespace-pre-wrap">{message}</p>
      {retryHref && (
        <a href={retryHref} className="btn mt-3">Retry</a>
      )}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
