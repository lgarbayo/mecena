/** Small inline line icons (no icon package). */
import type { TrustPoint } from "../copy";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function TrustIcon({ name }: { name: TrustPoint["icon"] }) {
  switch (name) {
    case "hand":
      return (
        <svg {...base}>
          <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7-6.5 7S5 17.5 4 15l-1.2-2.6a1.4 1.4 0 0 1 2.4-1.4L8 14" />
        </svg>
      );
    case "lock":
      return (
        <svg {...base}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "pen":
      return (
        <svg {...base}>
          <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      );
    case "stamp":
      return (
        <svg {...base}>
          <path d="M9 4h6l-1 7h-4L9 4Z" />
          <path d="M5 15h14v3H5zM7 21h10" />
        </svg>
      );
  }
}

export function MicIcon({ size = 28 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

export function PauseIcon({ size = 28 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}
