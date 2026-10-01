import { handle, isRole } from "@/lib/api";
import { PipelineError, ingest } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Step 1: parse, split off personal details, redact. The file itself is never stored. */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    const role = form.get("role");
    if (!isRole(role)) throw new PipelineError("Pick the role they applied for (PM or SPM).");
    if (!(file instanceof File)) throw new PipelineError("No file received.");
    if (file.size > 10 * 1024 * 1024) throw new PipelineError("File is over 10 MB.");
    const buffer = Buffer.from(await file.arrayBuffer());
    return ingest(buffer, file.name, role);
  });
}
