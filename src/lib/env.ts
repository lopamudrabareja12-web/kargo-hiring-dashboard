/** Server-side configuration. None of these are NEXT_PUBLIC_, so none reach the browser. */

export class ConfigError extends Error {}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v || v.startsWith("your-") || v.includes("YOUR-PROJECT")) {
    throw new ConfigError(`${name} is not set. Add it to .env.local (locally) or Vercel → Settings → Environment Variables.`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  geminiKey: () => required("GEMINI_API_KEY"),
  geminiModel: () => optional("GEMINI_MODEL", "gemini-2.5-flash"),
  geminiThinkingBudget: () => Number(optional("GEMINI_THINKING_BUDGET", "1024")),
  geminiTimeoutMs: () => Number(optional("GEMINI_TIMEOUT_MS", "40000")),
  resendKey: () => optional("RESEND_API_KEY"),
  resendFrom: () => optional("RESEND_FROM", "Kargo Hiring <onboarding@resend.dev>"),
  emailOverrideTo: () => optional("EMAIL_OVERRIDE_TO"),
  dashboardPassword: () => required("DASHBOARD_PASSWORD"),
  schedulingLink: () => optional("SCHEDULING_LINK"),
  senderName: () => optional("SENDER_NAME", "Arjun Mehta, Founder, Kargo"),
};
