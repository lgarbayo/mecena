import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { AppProvider } from "@/components/shell/AppProvider";
import { Header } from "@/components/shell/Header";
import { BottomNav } from "@/components/shell/BottomNav";
import { AgentLauncher } from "@/features/agent/ui/AgentSheet";
import { dossierFontClass } from "@/features/dossier/ui/fonts";
import "./globals.css";

// Inter (SIL OFL, src/app/_fonts/Inter-OFL.txt), self-hosted variable font: the UI typeface, exposed as --font-inter.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [{ path: "./_fonts/Inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
});

export const metadata: Metadata = {
  title: "Mecena",
  description: "Tú creas. Mecena se encarga del papeleo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FDFCFC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${dossierFontClass}`}>
      <body>
        <AppProvider>
          <Header />
          <main className="app-main">{children}</main>
          <BottomNav />
          <AgentLauncher />
        </AppProvider>
      </body>
    </html>
  );
}
