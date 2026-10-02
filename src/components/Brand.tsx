import { Icon } from "./Icons";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center bg-leaf-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_8px_18px_-8px_rgb(37_90_59/0.7)]"
      style={{ width: size, height: size, borderRadius: size * 0.34 }}
      aria-hidden="true"
    >
      <Icon name="leaf" size={Math.round(size * 0.55)} />
    </span>
  );
}

const TONES = ["bg-leaf-100 text-leaf-800", "bg-clay-100 text-clay-700", "bg-sun-100 text-sun-800", "bg-bark-100 text-bark-700"];

/** Initials in a squircle. Decorative: the name is always next to it. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  const tone = TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-semibold ${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.36, borderRadius: size * 0.32 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
