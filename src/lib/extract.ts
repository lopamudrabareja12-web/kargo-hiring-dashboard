import { createHash } from "node:crypto";
import { MIN_TEXT_CHARS } from "./constants";

export class ExtractError extends Error {}

/** Postgres refuses NUL characters, and other control characters are PDF/DOCX debris. */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse a PDF or DOCX buffer to plain text. The buffer is discarded after this. */
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  let text: string;
  if (lower.endsWith(".pdf")) {
    // Import the library file directly: the package index runs a debug self-test.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    try {
      text = (await pdfParse(buffer)).text;
    } catch {
      throw new ExtractError("Could not read this PDF (it may be encrypted or damaged).");
    }
  } else if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    try {
      text = (await mammoth.extractRawText({ buffer })).value;
    } catch {
      throw new ExtractError("Could not read this DOCX file (it may be damaged or an old .doc).");
    }
  } else {
    throw new ExtractError("Only PDF and DOCX files are supported.");
  }
  text = cleanExtractedText(text);
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new ExtractError(
      `Only ${text.replace(/\s/g, "").length} characters of text found (need ${MIN_TEXT_CHARS}+). ` +
        "This is probably a scanned image. Ask for a text PDF or DOCX.",
    );
  }
  return text;
}

/** Hash of the normalised text, so the same CV in a different file is still a duplicate. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
}
