/**
 * Loading placeholders (docs/design-system.md). Shapes are aria-hidden; wrap a loading area in <LoadingRegion> so
 * screen readers hear one "Cargando…" status instead of a pile of empty boxes.
 */
import { type CSSProperties, type ReactNode } from "react";

const px = (v: number | string | undefined) => (typeof v === "number" ? `${v}px` : v);

export function Skeleton({
  width,
  height = 14,
  radius,
  className = "",
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`}
      style={{ width: px(width) ?? "100%", height: px(height), borderRadius: px(radius), ...style }}
    />
  );
}

/** Lines of text; the last one is shorter, like a paragraph's. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`skeleton-text ${className}`} style={{ display: "grid" }}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 && lines > 1 ? "62%" : "100%"} />
      ))}
    </span>
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius="50%" />;
}

/** A card-shaped placeholder: optional media block on top (true = 160px, or a height), a title line and text lines. */
export function SkeletonCard({ lines = 2, media = false, className = "" }: { lines?: number; media?: boolean | number; className?: string }) {
  const mediaHeight = media === true ? 160 : typeof media === "number" ? media : 0;
  return (
    <div aria-hidden="true" className={`card skeleton-card ${className}`}>
      {mediaHeight > 0 && <Skeleton height={mediaHeight} radius={12} />}
      <Skeleton height={20} width="55%" radius={6} />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** `count` copies of `children` (one item template), or of a default card. */
export function SkeletonList({ count = 3, children, className = "" }: { count?: number; children?: ReactNode; className?: string }) {
  const item = children ?? <SkeletonCard />;
  return (
    <div aria-hidden="true" className={`skeleton-list ${className}`}>
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <div key={i}>{item}</div>
      ))}
    </div>
  );
}

/** A loading area: role=status, aria-busy, and a visually hidden label (the text stays in the DOM). */
export function LoadingRegion({ label = "Cargando…", children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}
