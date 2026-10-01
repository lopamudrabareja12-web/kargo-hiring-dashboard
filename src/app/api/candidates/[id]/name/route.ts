import { handle } from "@/lib/api";
import { setName } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { name } = (await req.json()) as { name?: string };
    return { stage: await setName(id, String(name ?? "")) };
  });
}
