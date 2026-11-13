// Dossier typefaces, self-hosted from ../fonts (same TTFs the PDF embeds), so the projector demo never
// depends on Google Fonts being reachable. Exposed as CSS variables read by dossier.css (--sans / --serif).
import localFont from "next/font/local";

export const dossierSans = localFont({
  variable: "--font-dossier-sans",
  display: "swap",
  src: [
    { path: "../fonts/SchibstedGrotesk-400-normal.ttf", weight: "400", style: "normal" },
    { path: "../fonts/SchibstedGrotesk-500-normal.ttf", weight: "500", style: "normal" },
    { path: "../fonts/SchibstedGrotesk-600-normal.ttf", weight: "600", style: "normal" },
  ],
});

export const dossierSerif = localFont({
  variable: "--font-dossier-serif",
  display: "swap",
  src: [
    { path: "../fonts/Newsreader-400-normal.ttf", weight: "400", style: "normal" },
    { path: "../fonts/Newsreader-400-italic.ttf", weight: "400", style: "italic" },
    { path: "../fonts/Newsreader-500-normal.ttf", weight: "500", style: "normal" },
    { path: "../fonts/Newsreader-500-italic.ttf", weight: "500", style: "italic" },
  ],
});

export const dossierFontClass = `${dossierSans.variable} ${dossierSerif.variable}`;
