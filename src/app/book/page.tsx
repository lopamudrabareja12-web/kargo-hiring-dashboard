import type { Metadata } from "next";
import { Logo } from "@/components/Brand";
import { Icon } from "@/components/Icons";

export const metadata: Metadata = { title: "Book a time with Arjun" };

/**
 * Public on purpose: this is the page the invite emails link to. It stands in for Arjun's real
 * calendar (Calendly, Cal.com or Google Calendar). Swap SCHEDULING_LINK for that link in production.
 */
export default function BookPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-12 text-center">
      <Logo size={56} />
      <h1 className="mt-6">Book a time with Arjun</h1>
      <p className="mt-3 text-muted">A 30-minute conversation about the Product Manager role at Kargo.</p>
      <div className="card mt-8 w-full text-left">
        <p className="flex items-center gap-2 font-semibold"><Icon name="clock" size={18} />Demo scheduling page</p>
        <p className="mt-2 text-sm text-muted">
          Kargo and this hiring case are fictional. In a live setup this link would open Arjun&apos;s real calendar
          (Calendly, Cal.com or Google Calendar), where the candidate picks a slot. Nothing can be booked here.
        </p>
      </div>
    </div>
  );
}
