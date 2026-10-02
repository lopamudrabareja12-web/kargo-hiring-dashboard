import { handle, uuid } from "@/lib/api";
import { buildPreview } from "@/lib/send";

export const runtime = "nodejs";

/** The exact final email (real name filled in) + recipient, for the in-page confirm step. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => buildPreview(uuid(id)));
}
