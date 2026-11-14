"use client";
/**
 * "Fotografiar una obra" without leaving the conversation: the works feature's own CaptureWork (photo + one dictated
 * line -> technical sheet) in a bottom sheet over the onboarding. Each created work goes back to the live dossier.
 */
import { useEffect } from "react";
import { artFamily, type Profile, type Work } from "@/contracts";
import { CaptureWork } from "@/features/works/CaptureWork";
import { artCopy } from "@/features/works/arts";
import { STEPS_COPY as C } from "../steps";
import s from "./live.module.css";

export function PhotoSheet({ profile, profileId, onCreated, onClose }: { profile: Profile | null; profileId?: string; onCreated(work: Work): void; onClose(): void }) {
  const copy = artCopy(artFamily(profile?.disciplines), false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.sheetBackdrop}>
      <div className={`${s.sheet} ${s.photoSheet}`} role="dialog" aria-modal="true" aria-labelledby="photo-sheet-title" data-testid="photo-sheet">
        <header className={s.sheetHead}>
          <h2 id="photo-sheet-title">{C.photoTitle}</h2>
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label={C.close}>
            ×
          </button>
        </header>
        <p className={s.sheetLede}>{C.photoLede}</p>
        <div className={s.sheetBody}>
          <CaptureWork copy={copy} profileId={profileId} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
