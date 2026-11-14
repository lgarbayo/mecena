// Content-shaped placeholder of the draft page: title block, section cards, budget and documents.
import { LoadingRegion, Skeleton, SkeletonList, SkeletonText } from "@/components/ui";
import s from "./draft.module.css";

/** While the call and the saved draft load (also the route's loading.tsx). */
export function DraftSkeleton({ label = "Cargando la solicitud…", header = true }: { label?: string; header?: boolean }) {
  return (
    <LoadingRegion label={label}>
      {header && (
        <div className={s.skelHead}>
          <Skeleton width={84} height={13} radius={6} />
          <Skeleton width="78%" height={36} radius={10} />
          <Skeleton width="52%" height={16} radius={6} />
        </div>
      )}
      <DraftSectionsSkeleton />
    </LoadingRegion>
  );
}

/** Section cards only: shown under the drafting steps while the AI writes. */
export function DraftSectionsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count}>
      <div className="card">
        <div className={s.skelSection}>
          <Skeleton width="44%" height={22} radius={8} />
          <SkeletonText lines={4} />
        </div>
      </div>
    </SkeletonList>
  );
}

