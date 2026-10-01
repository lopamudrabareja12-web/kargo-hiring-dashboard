import { handle } from "@/lib/api";
import { runStep } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs the next pipeline step for this candidate (score PM → score SPM + rank → brief/draft). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => runStep(id));
}
