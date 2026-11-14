// Instant, content-shaped placeholder while the B2B panel is computed on the server.
import { PageTitle } from "@/components/ui";
import { PanelSkeleton } from "@/features/panel/ui/PanelSkeleton";

export default function Loading() {
  return (
    <>
      <PageTitle kicker="Escuelas y asociaciones">Panel de organización</PageTitle>
      <PanelSkeleton />
    </>
  );
}
