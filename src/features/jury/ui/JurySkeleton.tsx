// Content-shaped placeholder of the jury page: score card, criteria with bars, fixes.
import { LoadingRegion, Skeleton, SkeletonList, SkeletonText } from "@/components/ui";
import s from "./jury.module.css";

export function JuryScoreSkeleton() {
  return (
    <>
      <div className={s.scoreBox} aria-hidden="true">
        <div className={s.skelScore}>
          <Skeleton width={150} height={72} radius={14} />
          <Skeleton width="70%" height={14} radius={6} />
          <Skeleton width="50%" height={14} radius={6} />
          <div className={s.judges}>
            <Skeleton width={84} height={24} radius={9999} />
            <Skeleton width={84} height={24} radius={9999} />
            <Skeleton width={84} height={24} radius={9999} />
          </div>
        </div>
      </div>
      <div className="card" aria-hidden="true">
        <Skeleton width="62%" height={24} radius={8} />
        <SkeletonList count={3}>
          <div className={s.crit}>
            <Skeleton width="100%" height={16} radius={6} />
            <div className={s.track} />
            <SkeletonText lines={2} />
          </div>
        </SkeletonList>
      </div>
    </>
  );
}

/** Route-level placeholder (loading.tsx) and the first load of the page. */
export function JurySkeleton({ label = "Abriendo el tribunal…", header = true }: { label?: string; header?: boolean }) {
  return (
    <LoadingRegion label={label}>
      {header && (
        <div style={{ display: "grid", gap: 10, margin: "0 0 20px" }}>
          <Skeleton width={120} height={13} radius={6} />
          <Skeleton width="56%" height={36} radius={10} />
        </div>
      )}
      <JuryScoreSkeleton />
    </LoadingRegion>
  );
}
