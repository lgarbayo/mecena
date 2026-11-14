// Owned by WP-03. /dossier?profileId&callId: editorial dossier + "Descargar PDF". The call variant is Pro.
import { Suspense } from "react";
import { DossierScreen, DossierScreenSkeleton } from "@/features/dossier/ui/DossierScreen";
import { dossierFontClass } from "@/features/dossier/ui/fonts";

export default function Page() {
  return (
    <div className={dossierFontClass}>
      <Suspense fallback={<DossierScreenSkeleton />}>
        <DossierScreen />
      </Suspense>
    </div>
  );
}
