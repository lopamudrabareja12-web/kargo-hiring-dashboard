import { handle, uuid } from "@/lib/api";
import { resetForRescore } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    await resetForRescore(uuid(id));
    return { stage: "extracted" };
  });
}
