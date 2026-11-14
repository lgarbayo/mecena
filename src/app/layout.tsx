import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/shell/AppProvider";
import { Header } from "@/components/shell/Header";
import { BottomNav } from "@/components/shell/BottomNav";
import { AgentLauncher } from "@/features/agent/ui/AgentSheet";
import { dossierFontClass } from "@/features/dossier/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mecena",
  description: "Tú creas. Mecena se encarga del papeleo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0b10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={dossierFontClass}>
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
