// Instant loading state for /dossier: the toolbar and paper-shaped pages, never a blank screen or a spinner.
import { DossierScreenSkeleton } from "@/features/dossier/ui/DossierScreen";

export default function Loading() {
  return <DossierScreenSkeleton />;
}
