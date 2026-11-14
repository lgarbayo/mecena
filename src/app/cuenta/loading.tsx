// /cuenta while the session loads: title, the connect card and the token list, as skeletons.
import { LoadingRegion, Skeleton, SkeletonCard, SkeletonText } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando tu cuenta…">
      <Skeleton width={160} height={13} />
      <Skeleton width="72%" height={40} style={{ marginTop: 10, marginBottom: 24 }} />
      <div className="card">
        <SkeletonText lines={3} />
        <Skeleton height={44} radius={12} style={{ marginTop: 20 }} />
      </div>
      <SkeletonCard lines={2} />
    </LoadingRegion>
  );
}
