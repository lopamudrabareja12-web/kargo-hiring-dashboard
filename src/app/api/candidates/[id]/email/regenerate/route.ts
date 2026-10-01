import { handle } from "@/lib/api";
import { draftFor } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Arjun explicitly asked for a fresh draft (replaces his edits). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ calls: await draftFor(id, { forceEmail: true }) }));
}
