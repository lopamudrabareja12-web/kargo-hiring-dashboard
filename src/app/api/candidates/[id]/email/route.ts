import { handle, readJson, uuid } from "@/lib/api";
import { saveEmailEdit } from "@/lib/pipeline";

export const runtime = "nodejs";

/** Save Arjun's edits to the draft (subject/body template, still with [NAME]). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { subject, body } = await readJson<{ subject: string; body: string }>(req);
    await saveEmailEdit(uuid(id), String(subject ?? ""), String(body ?? ""));
    return { saved: true };
  });
}
