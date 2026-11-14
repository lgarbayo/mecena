// /demo while the session loads: status tags and the scenario rows, as skeletons.
import { LoadingRegion, Skeleton, SkeletonList, SkeletonText } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando el panel de demo…">
      <Skeleton width={60} height={13} />
      <Skeleton width="55%" height={40} style={{ marginTop: 10, marginBottom: 24 }} />
      <div className="card">
        <SkeletonText lines={2} />
      </div>
      <div className="card">
        <SkeletonList count={4}>
          <div style={{ display: "grid", gap: 8, padding: "12px 0" }}>
            <Skeleton width={180} height={40} radius={9999} />
            <SkeletonText lines={2} />
          </div>
        </SkeletonList>
      </div>
    </LoadingRegion>
  );
}
