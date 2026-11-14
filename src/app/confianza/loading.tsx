// Owned by WP-01: the trust page's shape while it loads (title, intro, the promise cards).
import { LoadingRegion, Skeleton, SkeletonCard, SkeletonList, SkeletonText } from "@/components/ui";
import s from "@/features/onboarding/ui/trust.module.css";

export default function Loading() {
  return (
    <LoadingRegion className={s.home}>
      <div className={s.head}>
        <Skeleton width={90} height={14} radius={6} />
        <Skeleton width="80%" height={44} radius={8} />
        <SkeletonText lines={2} />
      </div>
      <SkeletonList count={4} className={s.rules}>
        <SkeletonCard lines={2} />
      </SkeletonList>
    </LoadingRegion>
  );
}
