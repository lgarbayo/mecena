// Owned by WP-03. /dossier?profileId&callId: editorial dossier + "Descargar PDF". The call variant is Pro.
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { DossierScreen } from "@/features/dossier/ui/DossierScreen";
import { dossierFontClass } from "@/features/dossier/ui/fonts";

export default function Page() {
  return (
    <div className={dossierFontClass}>
      <Suspense fallback={<Spinner label="Preparando tu dossier…" />}>
        <DossierScreen />
      </Suspense>
    </div>
  );
}
