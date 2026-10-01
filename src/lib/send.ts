/**
 * The human gate. Real names are substituted ONLY here, in code, at preview/send time.
 * One email per confirm. No bulk, no auto, no scheduled sending exists anywhere.
 */
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { db, logEvent, must, type EmailRow, type PiiRow } from "./db";
import { env } from "./env";
import { PipelineError } from "./pipeline";
import { fillTemplate, unfilledPlaceholders } from "./pii";

export interface EmailPreview {
  to: string;
  originalTo: string;
  overridden: boolean;
  from: string;
  subject: string;
  body: string;
  type: EmailRow["type"];
  kind: EmailRow["kind"];
  edited: boolean;
  outdated: boolean;
  previewHash: string;
}

const STALE_CLAIM_MS = 2 * 60_000;

export async function buildPreview(id: string): Promise<EmailPreview> {
  const email = must(await db().from("emails").select("*").eq("candidate_id", id).maybeSingle(), "loading the email") as EmailRow | null;
  if (!email) throw new PipelineError("There is no draft for this candidate yet.");
  if (email.sent_at) throw new PipelineError("This email was already sent.");
  const pii = must(await db().from("candidate_pii").select("*").eq("candidate_id", id).maybeSingle(), "loading contact details") as PiiRow | null;
  if (!pii?.name) throw new PipelineError("No name stored for this candidate.");
  if (!pii.email) throw new PipelineError("No email address was found in this CV, so it can't be sent from here.");

  const link = env.schedulingLink();
  if (email.type === "invite" && !link) throw new PipelineError("SCHEDULING_LINK is not set. Add it in Vercel (or .env.local) before sending invites.");

  const subject = fillTemplate(email.subject, { name: pii.name, schedulingLink: link });
  let body = fillTemplate(email.body_template, { name: pii.name, schedulingLink: link });
  const left = unfilledPlaceholders(subject + "\n" + body);
  if (left.length) throw new PipelineError(`The email still contains ${left.join(", ")}. Edit the draft to fix it.`);

  const override = env.emailOverrideTo();
  const to = override || pii.email;
  if (override) body += `\n\n[TEST] original recipient: ${pii.email}`;

  const previewHash = createHash("sha256").update(`${to}\n${subject}\n${body}`).digest("hex").slice(0, 16);
  return {
    to, originalTo: pii.email, overridden: !!override, from: env.resendFrom(), subject, body,
    type: email.type, kind: email.kind, edited: email.edited, outdated: email.outdated, previewHash,
  };
}

/** Send exactly what Arjun saw in the preview (checked by hash). A second send is impossible. */
export async function confirmAndSend(id: string, previewHash: string): Promise<{ sentAt: string; resendId: string }> {
  const key = env.resendKey();
  if (!key) throw new PipelineError("RESEND_API_KEY is not set yet. Add it in Vercel → Settings → Environment Variables and redeploy.");

  const preview = await buildPreview(id);
  if (preview.previewHash !== previewHash) {
    throw new PipelineError("The draft changed since you previewed it. Review the new version and confirm again.");
  }

  // Atomic claim: only one request can move this email from "unsent" to "confirmed".
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const claim = must(
    await db()
      .from("emails")
      .update({ confirmed_at: now.toISOString(), send_error: null })
      .eq("candidate_id", id)
      .is("sent_at", null)
      .or(`confirmed_at.is.null,confirmed_at.lt.${staleBefore}`)
      .select("candidate_id"),
    "locking the email for sending",
  ) as { candidate_id: string }[];
  if (!claim.length) throw new PipelineError("This email is already sent or being sent. Refresh the page.");
  await logEvent(id, "send_confirmed", { type: preview.type, kind: preview.kind, edited: preview.edited, test_override: preview.overridden });

  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from: preview.from,
    to: preview.to,
    subject: preview.subject,
    text: preview.body,
  });

  if (error || !data?.id) {
    const msg = error?.message ?? "Resend returned no id";
    const hint = /only send testing emails to your own email|verify a domain/i.test(msg)
      ? " (Resend's free onboarding@resend.dev sender only delivers to your Resend account's own address: set EMAIL_OVERRIDE_TO to it, or verify a domain.)"
      : "";
    await db().from("emails").update({ confirmed_at: null, send_error: `${msg}${hint}`.slice(0, 500) }).eq("candidate_id", id);
    await logEvent(id, "send_failed", { message: msg.slice(0, 200).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]") });
    throw new PipelineError(`Send failed: ${msg}${hint}`);
  }

  const sentAt = new Date().toISOString();
  must(
    await db().from("emails").update({
      sent_at: sentAt, sent_to: preview.to, resend_id: data.id, final_subject: preview.subject, final_body: preview.body,
      outdated: false,
    }).eq("candidate_id", id),
    "recording the send",
  );
  await logEvent(id, "sent", { type: preview.type, kind: preview.kind, edited: preview.edited, resend_id: data.id, test_override: preview.overridden });
  return { sentAt, resendId: data.id };
}
