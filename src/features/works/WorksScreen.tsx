"use client";
/** /obras (WP-02): capture works, review their sheets, order them for the dossier. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES, type TechnicalSheet, type Work } from "@/contracts";
import { PageTitle, Spinner } from "@/components/ui";
import { useApp } from "@/components/shell/AppProvider";
import { CaptureWork } from "./CaptureWork";
import { errorText, worksClient } from "./client";
import { WorkCard } from "./WorkCard";
import s from "./works.module.css";

export function WorksScreen() {
  const { profile } = useApp();
  const business = profile?.kind === "business";
  const [works, setWorks] = useState<Work[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setWorks(await worksClient.list(profile?.id));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile) void load();
  }, [profile, load]);

  const replace = (w: Work) => setWorks((ws) => (ws ?? []).map((x) => (x.id === w.id ? w : x)));

  async function onSave(id: string, patch: { sheet?: Partial<TechnicalSheet>; confirmed?: boolean; crop?: Work["crop"] }) {
    try {
      replace(await worksClient.update(id, patch));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function onMove(id: string, direction: -1 | 1) {
    // Optimistic swap, then trust the server's order.
    setWorks((ws) => {
      if (!ws) return ws;
      const i = ws.findIndex((w) => w.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= ws.length) return ws;
      const next = [...ws];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    try {
      setWorks(await worksClient.move(id, direction));
    } catch (e) {
      setError(errorText(e));
      void load();
    }
  }

  async function onRemove(id: string) {
    setWorks((ws) => ws?.filter((w) => w.id !== id) ?? ws);
    try {
      await worksClient.remove(id);
    } catch (e) {
      setError(errorText(e));
    }
    void load();
  }

  const confirmed = works?.filter((w) => w.confirmed).length ?? 0;

  return (
    <>
      <PageTitle kicker={business ? "Fotos (opcional)" : "Tus obras"}>{business ? "Enseña lo que haces" : "Fotografía tus obras"}</PageTitle>

      {business ? (
        <p className={s.intro}>
          Las fotos son opcionales en una pyme: si quieres, añade productos, tu taller o tu local y aparecerán en tu dossier. Si no, pasa directamente al dossier.
        </p>
      ) : (
        <p className={s.intro}>Una foto con el móvil y una frase por obra. Mecena escribe la ficha técnica; tú la revisas y confirmas.</p>
      )}

      <div className={s.trust} role="note">
        <strong>Solo recortamos y enderezamos la foto. Tu obra no se toca.</strong>
        <span>No entrenamos con tu obra. Tú tienes la última palabra en cada ficha.</span>
      </div>

      <CaptureWork
        business={business}
        profileId={profile?.id}
        onCreated={(w) => {
          setWorks((ws) => [...(ws ?? []).filter((x) => x.id !== w.id), w]);
          setFresh(w.id);
        }}
      />

      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {works === null && !error ? (
        <Spinner label="Cargando tus obras…" />
      ) : works && works.length > 0 ? (
        <>
          <div className={s.listHead}>
            <h2>{business ? "Tus fotos" : "Tus obras"}</h2>
            <span className={s.muted}>
              {works.length} {works.length === 1 ? (business ? "foto" : "obra") : business ? "fotos" : "obras"} · {confirmed} {confirmed === 1 ? "confirmada" : "confirmadas"}
            </span>
          </div>
          <p className={s.hint}>El orden de aquí es el orden de tu dossier.</p>
          {works.map((w, i) => (
            <WorkCard key={w.id} work={w} index={i} total={works.length} business={business} highlight={w.id === fresh} onSave={onSave} onMove={onMove} onRemove={onRemove} />
          ))}
        </>
      ) : (
        works && (
          <div className={s.empty}>
            <p>{business ? "Todavía no has añadido fotos. No pasa nada: son opcionales." : "Aún no hay obras. Haz la primera foto: con dos o tres basta para empezar."}</p>
          </div>
        )
      )}

      <div className={s.footerCta}>
        <Link href={ROUTES.dossier} className="btn btn-primary">
          Ver mi dossier →
        </Link>
      </div>
    </>
  );
}
