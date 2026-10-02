/** Light-line icons, one stroke weight (1.5) so they read as a set. Decorative: always aria-hidden. */
const PATHS = {
  leaf: ["M5 19c0-8 5-14 14-14 0 9-6 14-14 14Z", "M5 19 13 11"],
  upload: ["M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5", "M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"],
  list: ["M9 6h11M9 12h11M9 18h11", "M4.5 6h.01M4.5 12h.01M4.5 18h.01"],
  book: ["M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z", "M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"],
  lock: ["M6 11h12v9H6v-9Z", "M9 11V8a3 3 0 0 1 6 0v3"],
  sparkle: ["M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z"],
  scale: ["M12 4v16M7 20h10M5 7.5h14", "M5 7.5 2.5 14a3 3 0 0 0 5 0L5 7.5Z", "M19 7.5 16.5 14a3 3 0 0 0 5 0L19 7.5Z"],
  mail: ["M4 6h16v12H4V6Z", "M4.5 7l7.5 6 7.5-6"],
  phone: ["M7 4h3l1.5 4-2 1.3a10 10 0 0 0 4.2 4.2L15 11.5l4 1.5v3a2 2 0 0 1-2 2A13 13 0 0 1 5 6a2 2 0 0 1 2-2Z"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "m20 20-4-4"],
  check: ["M5 12.5 9.5 17 19 7.5"],
  warning: ["M12 4 3 19h18L12 4Z", "M12 10v4m0 3h.01"],
  arrowUpRight: ["M7 17 17 7", "M9 7h8v8"],
  arrowLeft: ["M19 12H5m0 0 6-6m-6 6 6 6"],
  pencil: ["M4 20h4L19 9l-4-4L4 16v4Z", "m13 7 4 4"],
  trash: ["M5 7h14", "M10 7V4h4v3", "M6.5 7l1 13h9l1-13", "M10 11v5m4-5v5"],
  sprout: ["M12 21v-9", "M12 12C12 8.5 9.5 6 6 6c0 3.5 2.5 6 6 6Z", "M12 12c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z"],
  file: ["M7 3h7l5 5v13H7V3Z", "M14 3v5h5"],
  logout: ["M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4", "M15 8l4 4-4 4M19 12H9"],
  note: ["M6 3h12v18H6V3Z", "M9 8h6M9 12h6M9 16h4"],
  eye: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
  send: ["M4 12 20 4l-4 16-4.5-6.5L4 12Z", "M11.5 13.5 20 4"],
  mailCheck: ["M4 6h16v12H4V6Z", "M4.5 7l7.5 6 7.5-6"],
  pen: ["M5 19l3.5-.8L19 7.7 16.3 5 5.8 15.5 5 19Z"],
  clock: ["M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "M12 8v4l2.5 2"],
  user: ["M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M4.5 20a7.5 7.5 0 0 1 15 0"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
