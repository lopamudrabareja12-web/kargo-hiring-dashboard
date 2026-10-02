import { handle, readJson, uuid } from "@/lib/api";
import { draftFor } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Arjun explicitly asked for a fresh draft. If he had edited the old one, he must confirm first. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { replaceEdits } = await readJson<{ replaceEdits: boolean }>(req);
    return { calls: await draftFor(uuid(id), { forceEmail: true, replaceEdits: replaceEdits === true }) };
  });
}
