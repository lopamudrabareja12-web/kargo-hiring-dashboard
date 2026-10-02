import Link from "next/link";
import { Icon } from "@/components/Icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[1.3rem] bg-sand text-muted"><Icon name="search" size={28} /></span>
      <h1 className="mt-6">That page doesn&apos;t exist</h1>
      <p className="mt-2 text-muted">The link may be old, or the candidate may have been deleted.</p>
      <Link href="/" className="btn-cta mt-8 no-underline">
        Back to the shortlist
        <span className="btn-dot"><Icon name="arrowLeft" size={16} /></span>
      </Link>
    </div>
  );
}
