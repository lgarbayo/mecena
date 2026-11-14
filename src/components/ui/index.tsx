/** Shared UI primitives (scaffold-owned). Styling lives in app/globals.css (docs/design-system.md); keep these dumb. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export * from "./skeleton";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button {...props} className={`btn btn-${variant}${size === "sm" ? " btn-sm" : ""} ${className}`} />;
}

/** Circular icon-only button: always give it an aria-label. */
export function IconButton({ className = "", variant = "ghost", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" {...props} className={`btn btn-${variant} btn-icon ${className}`} />;
}

export function Card({ children, className = "", size = "md" }: { children: ReactNode; className?: string; size?: "sm" | "md" }) {
  return <section className={`card${size === "sm" ? " card-sm" : ""} ${className}`}>{children}</section>;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "err" | "info" | "accent" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function PageTitle({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <header className="page-title">
      {kicker && <p className="kicker">{kicker}</p>}
      <h1>{children}</h1>
    </header>
  );
}

/** Small inline loader; the label stays in the DOM as text (tests and screen readers read it). */
export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <p className="spinner" role="status">
      {label}
    </p>
  );
}

/** The soft gradient orb: voice/agent moments only. */
export function Orb({ size = 96, className = "" }: { size?: number; className?: string }) {
  return <span className={`orb ${className}`} aria-hidden="true" style={{ ["--orb-size" as string]: `${size}px`, display: "inline-block" }} />;
}

/** Placeholder for pages a WP has not built yet. */
export function Pending({ wp, what }: { wp: string; what: string }) {
  return (
    <Card className="pending">
      <p className="kicker">{wp}</p>
      <p>{what}</p>
    </Card>
  );
}
