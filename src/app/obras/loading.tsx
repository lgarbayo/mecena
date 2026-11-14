// Instant loading state for /obras: the page head and the shape of the work cards, never a blank screen.
import { Skeleton } from "@/components/ui";
import { WorksListSkeleton } from "@/features/works/WorkCard";

export default function Loading() {
  return (
    <>
      <header className="page-title" aria-hidden="true">
        <Skeleton width={120} height={14} radius={6} />
        <Skeleton width="70%" height={40} radius={10} style={{ marginTop: 10 }} />
      </header>
      <WorksListSkeleton />
    </>
  );
}
