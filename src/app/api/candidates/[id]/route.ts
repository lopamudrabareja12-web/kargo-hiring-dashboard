import { handle, uuid } from "@/lib/api";
import { deleteCandidate } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Delete every row for this person (DPDP: deletion on request). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    await deleteCandidate(uuid(id));
    return { deleted: true };
  });
}
