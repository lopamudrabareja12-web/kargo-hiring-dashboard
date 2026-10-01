import { UploadClient } from "./UploadClient";

export default function UploadPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1>Upload CVs</h1>
        <p className="mt-1 text-sm text-neutral-600">
          PDF or DOCX. Personal details are split off in code before anything reaches AI, and the original file is not kept.
          Every candidate is scored for both PM and SPM.
        </p>
      </div>
      <UploadClient />
    </div>
  );
}
