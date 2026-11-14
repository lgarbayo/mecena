// Calls feed while the route streams in: page title + the feed's own skeleton.
import { Skeleton } from "@/components/ui";
import { CallsFeedSkeleton } from "@/features/matching/ui/skeletons";

export default function Loading() {
  return (
    <>
      <div style={{ display: "grid", gap: 10, margin: "8px 0 20px" }} aria-hidden>
        <Skeleton width={72} height={13} radius={6} />
        <Skeleton width="62%" height={40} radius={10} />
      </div>
      <CallsFeedSkeleton />
    </>
  );
}
