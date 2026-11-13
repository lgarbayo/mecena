import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/shell/AppProvider";
import { Header } from "@/components/shell/Header";
import { BottomNav } from "@/components/shell/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mecena",
  description: "Tú creas. Mecena se encarga del papeleo.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f1e7" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppProvider>
          <Header />
          <main className="app-main">{children}</main>
          <BottomNav />
        </AppProvider>
      </body>
    </html>
  );
}
