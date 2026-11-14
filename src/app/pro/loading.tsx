// /pro while it loads: the offer card with its three plan cards, as skeletons.
import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando los planes…">
      <Skeleton width={90} height={13} />
      <Skeleton width="80%" height={40} style={{ marginTop: 10, marginBottom: 24 }} />
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <Skeleton width="65%" height={30} />
        <SkeletonText lines={4} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={84} radius={16} />
        ))}
      </div>
    </LoadingRegion>
  );
}
