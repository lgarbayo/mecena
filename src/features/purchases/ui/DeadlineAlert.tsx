"use client";
// WP-07: the in-app deadline alert Mecena Pro includes, on top of the calls feed.
import Link from "next/link";
import { ROUTES, type Call } from "@/contracts";
import { closesIn, closingSoon } from "../alerts";
import s from "./paywall.module.css";

export function DeadlineAlert({ pro, results }: { pro: boolean; results: { call: Call }[] }) {
  if (!pro) return null;
  const soon = closingSoon(results);
  if (!soon.length) return null;
  return (
    <section className={s.alert} aria-label="Avisos de cierre" data-testid="deadline-alert">
      <p className={s.alertTitle}>{soon.length === 1 ? "Una convocatoria tuya cierra en los próximos 7 días" : "Convocatorias tuyas que cierran en los próximos 7 días"}</p>
      <ul className={s.alertList}>
        {soon.map(({ call, days }) => (
          <li key={call.id}>
            <Link href={ROUTES.call(call.id)}>
              <strong>{closesIn(days)}</strong> · {call.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
