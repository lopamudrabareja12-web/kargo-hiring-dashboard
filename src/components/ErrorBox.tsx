import { Icon } from "./Icons";

export function ErrorBox({ title = "Something went wrong", message, retryHref }: { title?: string; message: string; retryHref?: string }) {
  return (
    <div role="alert" className="card-tint bg-clay-50" style={{ boxShadow: "0 0 0 6px rgb(208 116 63 / 0.06), 0 0 0 7px rgb(208 116 63 / 0.18)" }}>
      <p className="flex items-center gap-2 font-semibold text-clay-700"><Icon name="warning" size={20} />{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-clay-700">{message}</p>
      {retryHref && <a href={retryHref} className="btn mt-4 no-underline">Try again</a>}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
