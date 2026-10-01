import { UploadClient } from "./UploadClient";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Step 1 of the pipeline</p>
        <h1 className="mt-1">Upload CVs</h1>
        <p className="mt-1 text-muted">
          Drop in PDFs or Word files. Each one is read, scored for both roles and given a draft email. You review everything before anything is sent.
        </p>
      </div>
      <UploadClient />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["🔒", "Private first", "Name, email and phone are split off in code before any AI sees the CV."],
          ["🗑️", "File not kept", "The original file is read and thrown away. Only the redacted text is stored."],
          ["⚖️", "Both roles", "Everyone is scored for PM and SPM, so a great fit for the other role isn't missed."],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-3xl bg-white/70 p-4 text-sm shadow-sm">
            <p className="font-semibold">{icon} {title}</p>
            <p className="mt-1 text-xs text-muted">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
