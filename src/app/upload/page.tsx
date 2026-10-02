import type { Metadata } from "next";
import { Icon, type IconName } from "@/components/Icons";
import { UploadClient } from "./UploadClient";

export const metadata: Metadata = { title: "Upload CVs" };

const NOTES: { icon: IconName; title: string; text: string }[] = [
  { icon: "lock", title: "Private first", text: "Name, email and phone are split off in code before any AI sees the CV." },
  { icon: "trash", title: "File not kept", text: "The original file is read and discarded. Only the redacted text is stored." },
  { icon: "scale", title: "Both roles", text: "Everyone is scored for PM and SPM, so a strong fit for the other role isn't missed." },
];

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <header className="reveal">
        <span className="eyebrow-pill">Step 1 · add candidates</span>
        <h1 className="mt-4">Upload CVs</h1>
        <p className="mt-3 max-w-prose text-muted">
          Drop in PDFs or Word files. Each one is read, scored for both roles and given a draft email. You review everything before anything is sent.
        </p>
      </header>
      <UploadClient />
      <ul className="grid gap-5 sm:grid-cols-3">
        {NOTES.map((n, i) => (
          <li key={n.title} className="reveal" style={{ "--i": i + 3 } as React.CSSProperties}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-leaf-100 text-leaf-700"><Icon name={n.icon} size={18} /></span>
            <p className="mt-3 font-semibold">{n.title}</p>
            <p className="mt-1 text-sm text-muted">{n.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
