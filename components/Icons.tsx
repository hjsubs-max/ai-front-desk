import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P) {
  return { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...rest };
}

export const Sparkle = (p: P) => (
  <svg {...base({ size: 12, strokeWidth: 2, ...p })}>
    <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
  </svg>
);
export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const CalendarX = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 14l6 4M15 14l-6 4" />
  </svg>
);
export const Calendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);
export const Bag = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 8h12l-1 12H7z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
  </svg>
);
export const Thermo = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z" />
  </svg>
);
export const Car = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 16l1.5-5h11L19 16M4 16h16v3H4zM7 19v1M17 19v1" />
  </svg>
);
export const People = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6" />
  </svg>
);
export const Door = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 20V4h9v16M15 6h3v14M11 12h1" />
  </svg>
);
export const Mic = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
export const ArrowUp = (p: P) => (
  <svg {...base({ strokeWidth: 2, ...p })}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const Back = (p: P) => (
  <svg {...base({ size: 18, strokeWidth: 2, ...p })}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const Person = (p: P) => (
  <svg {...base({ size: 22, ...p })}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);
export const Doc = (p: P) => (
  <svg {...base({ size: 16, ...p })}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const Phone = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);

export const ACTION_ICONS: Record<string, (p: P) => React.JSX.Element> = {
  running_late: Clock,
  absent_today: CalendarX,
  absent_tomorrow: CalendarX,
  forgot_lunch: Bag,
  child_unwell: Thermo,
  late_for_pickup: Car,
  someone_else_pickup: People,
  picking_up_early: Door,
  book_tour: Calendar,
};
