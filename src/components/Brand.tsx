export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-2xl bg-leaf-600 text-white shadow-soft"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14Z" />
        <path d="M5 19 13 11" />
      </svg>
    </span>
  );
}

const PALETTE = [
  "bg-leaf-100 text-leaf-800", "bg-clay-100 text-clay-700", "bg-sun-100 text-sun-800", "bg-plum-100 text-plum-700",
];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  const tone = PALETTE[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <span className={`avatar ${tone}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}
