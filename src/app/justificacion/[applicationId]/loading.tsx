// Instant, content-shaped placeholder while the justification route streams in.
import { PageTitle } from "@/components/ui";
import { JustificationSkeleton } from "@/features/justification/ui/JustificationPage";

export default function Loading() {
  return (
    <>
      <PageTitle kicker="Justificación">Justifica tu subvención</PageTitle>
      <JustificationSkeleton />
    </>
  );
}
