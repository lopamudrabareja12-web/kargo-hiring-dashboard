import { handle, isRole } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { PipelineError, ingest } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Step 1: parse, split off personal details, redact. The file itself is never stored. */
export async function POST(req: Request) {
  return handle(async () => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new PipelineError("Choose a PDF or Word file and pick the role they applied for.");
    }
    const file = form.get("file");
    const role = form.get("role");
    if (!isRole(role)) throw new PipelineError("Pick the role they applied for (PM or SPM).");
    if (!(file instanceof File) || file.size === 0) throw new PipelineError("No file received. Choose a PDF or Word file.");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new PipelineError(`This file is ${(file.size / 1048576).toFixed(1)} MB. Files over ${MAX_UPLOAD_BYTES / 1048576} MB can't be uploaded here (hosting limit): save a smaller PDF and try again.`);
    }
    return ingest(Buffer.from(await file.arrayBuffer()), file.name, role);
  });
}
