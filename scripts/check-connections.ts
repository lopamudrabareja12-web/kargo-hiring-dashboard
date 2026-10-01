/** npm run check: verifies the Supabase and Gemini keys in .env.local work. Prints no secrets. */
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const r = await sb.from("rubric_criteria").select("id", { count: "exact", head: true });
  console.log("Supabase:", r.error ? `FAIL: ${r.error.message}` : `OK (tables found, rubric_criteria has ${r.count} rows)`);
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const g = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
      contents: "Reply with the single word OK.",
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });
    console.log("Gemini:  ", `OK (model replied "${(g.text ?? "").trim().slice(0, 20)}")`);
  } catch (e) {
    console.log("Gemini:  ", `FAIL ${(e as { status?: number }).status ?? ""} ${String((e as Error).message).slice(0, 300)}`);
  }
}
main();
