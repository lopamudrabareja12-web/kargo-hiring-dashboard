import { handle, readJson, uuid } from "@/lib/api";
import { PipelineError, setOverride } from "@/lib/pipeline";
import type { EmailKind } from "@/lib/ranking";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: EmailKind[] = ["invite", "invite_plus_other", "invite_other_role", "rejection"];

/** Arjun overrides the recommended email type. Logged with his reason; replacing his edits needs a confirm. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { kind, reason, replaceEdits } = await readJson<{ kind: string | null; reason: string; replaceEdits: boolean }>(req);
    if (kind !== null && !KINDS.includes(kind as EmailKind)) throw new PipelineError("Unknown email type.");
    await setOverride(uuid(id), kind as EmailKind | null, String(reason ?? ""), replaceEdits === true);
    return { ok: true };
  });
}
