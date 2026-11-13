"use client";
/** The artist's photo, untouched. The suggested crop/straighten is only CSS; "Ver original" removes it. */
import { useState } from "react";
import type { CropSuggestion } from "@/contracts";
import { cropStyles, isIdentityCrop } from "./image";
import s from "./works.module.css";

export function WorkPhoto({ src, alt, crop, showOriginal = false }: { src: string; alt: string; crop?: CropSuggestion; showOriginal?: boolean }) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const styles = cropStyles(showOriginal ? undefined : crop, natural);
  const cropped = !showOriginal && natural && !isIdentityCrop(crop);
  return (
    <div className={`${s.photoFrame} ${cropped ? s.photoCropped : ""}`} style={styles.frame}>
      {failed ? (
        <p className={s.photoMissing}>No encontramos la foto</p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- original bytes, no Next optimisation/re-encoding
        <img
          src={src}
          alt={alt}
          style={styles.img}
          onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
          draggable={false}
        />
      )}
    </div>
  );
}
