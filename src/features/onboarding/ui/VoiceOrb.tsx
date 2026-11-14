"use client";
/**
 * Voice-reactive orb: while `active`, reads the microphone through Web Audio (AnalyserNode) and morphs an organic
 * shape by frequency band; volume drives size, glow and hue. Without mic access it falls back to `pulse`
 * (bumped whenever the dictation produces text). Idle: slow breathing. Reduced motion: static gradient.
 * Phones and tablets never get that second microphone stream: there it competes with the dictation itself
 * (SpeechRecognition stops hearing the person once the orb holds the mic), so the orb uses the pulse instead.
 */
import { useEffect, useRef } from "react";

const POINTS = 120;
/** Android and iOS/iPadOS: one capture at a time, and the dictation must win. */
export function micSharingUnsafe(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  return /Android|iPhone|iPad|iPod/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

const PALETTE: [number, number, number][] = [
  [255, 122, 69], // terracotta
  [179, 140, 255], // violet
  [79, 209, 197], // teal
];

export function VoiceOrb({ active, pulse = 0, size = 280 }: { active: boolean; pulse?: number; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const fallback = useRef(0);

  // mic stream only while active
  useEffect(() => {
    if (!active || micSharingUnsafe()) return;
    let stream: MediaStream | undefined;
    let ctx: AudioContext | undefined;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        const node = ctx.createAnalyser();
        node.fftSize = 512;
        node.smoothingTimeConstant = 0.82;
        ctx.createMediaStreamSource(stream).connect(node);
        analyser.current = node;
      } catch {
        analyser.current = null; // no mic access: the pulse fallback animates instead
      }
    })();
    return () => {
      cancelled = true;
      analyser.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => undefined);
    };
  }, [active]);

  useEffect(() => {
    fallback.current = Math.min(1, fallback.current + 0.55);
  }, [pulse]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext("2d");
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * dpr;
    g.scale(dpr, dpr);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bins = new Uint8Array(256);
    let level = 0;
    let raf = 0;
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const a = analyser.current;
      let target = 0;
      const bands = new Array<number>(POINTS).fill(0);
      if (a && active) {
        a.getByteFrequencyData(bins);
        const usable = 96; // voice lives in the lower bins
        let sum = 0;
        for (let i = 0; i < usable; i++) sum += bins[i];
        target = Math.min(1, (sum / usable / 255) * 2.2);
        for (let i = 0; i < POINTS; i++) {
          // mirror so the shape is symmetric and smooth around the circle
          const k = i < POINTS / 2 ? i : POINTS - i;
          bands[i] = bins[Math.floor((k / (POINTS / 2)) * (usable - 1))] / 255;
        }
      } else if (active) {
        fallback.current *= 0.94;
        target = fallback.current * 0.8;
        for (let i = 0; i < POINTS; i++) bands[i] = target * (0.5 + 0.5 * Math.sin(i * 0.45 + t * 4));
      }
      // smooth neighbouring bands so the outline stays organic instead of jagged
      const smooth = bands.map((_, i) => (bands[(i - 2 + POINTS) % POINTS] + 2 * bands[(i - 1 + POINTS) % POINTS] + 3 * bands[i] + 2 * bands[(i + 1) % POINTS] + bands[(i + 2) % POINTS]) / 9);
      level += (target - level) * 0.18;

      const c = size / 2;
      const base = size * (active ? 0.27 : 0.25) * (1 + level * 0.18 + (reduced ? 0 : Math.sin(t * 1.4) * 0.015));
      g.clearRect(0, 0, size, size);

      // glow
      const hueShift = (t * 0.12 + level * 0.6) % 1;
      const mix = (k: number): [number, number, number] => {
        const x = (k + hueShift) * PALETTE.length;
        const i = Math.floor(x) % PALETTE.length;
        const j = (i + 1) % PALETTE.length;
        const f = x - Math.floor(x);
        return [0, 1, 2].map((n) => Math.round(PALETTE[i][n] * (1 - f) + PALETTE[j][n] * f)) as [number, number, number];
      };
      const [r1, g1, b1] = mix(0);
      const [r2, g2, b2] = mix(0.5);
      const halo = g.createRadialGradient(c, c, base * 0.4, c, c, size * 0.5);
      halo.addColorStop(0, `rgba(${r1},${g1},${b1},${0.22 + level * 0.35})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = halo;
      g.fillRect(0, 0, size, size);

      // three morphing layers
      for (let layer = 0; layer < 3; layer++) {
        const [r, gg, b] = mix(layer / 3);
        g.beginPath();
        for (let i = 0; i <= POINTS; i++) {
          const p = i % POINTS;
          const ang = (p / POINTS) * Math.PI * 2 + layer * 0.7 + (reduced ? 0 : t * (0.15 + layer * 0.07));
          const wobble = reduced ? 0 : Math.sin(ang * 3 + t * (1.1 + layer * 0.4)) * 0.035 + Math.sin(ang * 5 - t * 0.9) * 0.02;
          const rad = base * (1 - layer * 0.13) * (1 + wobble + smooth[p] * (0.3 - layer * 0.06));
          const x = c + Math.cos(ang) * rad;
          const y = c + Math.sin(ang) * rad;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        const fill = g.createRadialGradient(c - base * 0.3, c - base * 0.35, 0, c, c, base * 1.3);
        fill.addColorStop(0, `rgba(255,255,255,${layer === 2 ? 0.35 : 0.08})`);
        fill.addColorStop(0.28, `rgba(${r},${gg},${b},${0.95 - layer * 0.15})`);
        fill.addColorStop(1, `rgba(${r2},${g2},${b2},${0.7 - layer * 0.15})`);
        g.fillStyle = fill;
        g.globalCompositeOperation = "source-over";
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
      if (!reduced || active) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, size]);

  return <canvas ref={canvas} style={{ width: size, height: size, maxWidth: "70vw", maxHeight: "70vw" }} aria-hidden />;
}
