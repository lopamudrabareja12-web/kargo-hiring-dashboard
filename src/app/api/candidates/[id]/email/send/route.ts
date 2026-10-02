import { handle, readJson, uuid } from "@/lib/api";
import { PipelineError } from "@/lib/pipeline";
import { confirmAndSend } from "@/lib/send";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sends ONE email, only after Arjun confirmed the preview. There is no bulk endpoint. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { previewHash } = await readJson<{ previewHash: string }>(req);
    if (!previewHash) throw new PipelineError("Open the preview and confirm it first.");
    return confirmAndSend(uuid(id), String(previewHash));
  });
}
