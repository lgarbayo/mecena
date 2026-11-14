// Content-shaped loading states for the calls feed and the call detail (also used by the routes' loading.tsx).
import { LoadingRegion, Skeleton, SkeletonCard, SkeletonText } from "@/components/ui";
import s from "./calls.module.css";

/** Content-shaped placeholder for one match card: title + organizer, fit pill, fact pills, breakdown, two reasons. */
export function CallCardSkeleton() {
  return (
    <div className={s.skelCard} aria-hidden>
      <div className={s.skelRow}>
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <Skeleton width="78%" height={22} radius={8} />
          <Skeleton width="46%" height={14} radius={6} />
        </div>
        <Skeleton width={64} height={28} radius={9999} />
      </div>
      <div className={s.skelPills}>
        <Skeleton width={88} height={24} radius={9999} />
        <Skeleton width={120} height={24} radius={9999} />
      </div>
      <Skeleton width="100%" height={4} radius={9999} />
      <SkeletonText lines={2} />
    </div>
  );
}

/** The whole feed while it loads: funnel, search, chips and three cards. */
export function CallsFeedSkeleton({ label = "Buscando convocatorias para ti…" }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <div className={s.fitPanel} aria-hidden>
        <div className={s.skelFunnel}>
          <Skeleton height={62} radius={12} />
          <Skeleton height={62} radius={12} />
          <Skeleton height={62} radius={12} />
        </div>
        <Skeleton height={44} radius={12} />
        <div className={s.skelPills}>
          <Skeleton width={72} height={36} radius={9999} />
          <Skeleton width={104} height={36} radius={9999} />
          <Skeleton width={96} height={36} radius={9999} />
        </div>
      </div>
      <CallCardSkeleton />
      <CallCardSkeleton />
      <CallCardSkeleton />
    </LoadingRegion>
  );
}

/** Content-shaped placeholder for the detail: title, summary, key facts, fit breakdown, checklist. */
export function CallDetailSkeleton() {
  return (
    <LoadingRegion label="Cargando la convocatoria…">
      <div aria-hidden>
        <div className={s.hero} style={{ display: "grid", gap: 10 }}>
          <Skeleton width={140} height={13} radius={6} />
          <Skeleton width="88%" height={36} radius={10} />
          <Skeleton width="60%" height={36} radius={10} />
        </div>
        <SkeletonText lines={3} />
        <div className={s.kv}>
          <Skeleton width={64} height={14} radius={6} />
          <Skeleton width="50%" height={14} radius={6} />
          <Skeleton width={64} height={14} radius={6} />
          <Skeleton width="70%" height={14} radius={6} />
          <Skeleton width={64} height={14} radius={6} />
          <Skeleton width="40%" height={14} radius={6} />
        </div>
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </div>
    </LoadingRegion>
  );
}
