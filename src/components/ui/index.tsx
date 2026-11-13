/** Shared UI primitives (scaffold-owned). Styling lives in app/globals.css; keep these dumb. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet" }) {
  return <button {...props} className={`btn btn-${variant} ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "accent" }) {
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

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <p className="spinner" role="status">
      {label}
    </p>
  );
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
