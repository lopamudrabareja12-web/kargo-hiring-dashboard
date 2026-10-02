import { handle, isRole, readJson, uuid } from "@/lib/api";
import { PipelineError, changeRole } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-file a candidate under the other role (e.g. uploaded as PM by mistake). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { role } = await readJson<{ role: string }>(req);
    if (!isRole(role)) throw new PipelineError("Pick PM or SPM.");
    return changeRole(uuid(id), role);
  });
}
