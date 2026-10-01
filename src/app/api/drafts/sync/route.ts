import { handle } from "@/lib/api";
import { syncDrafts } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generate missing briefs / redraft emails for people whose rank moved. Call until remaining = 0. */
export async function POST() {
  return handle(() => syncDrafts());
}
