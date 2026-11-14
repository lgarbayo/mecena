// Owned by WP-01: the home's shape while it loads (title, three data cards, the CTAs).
import { LoadingRegion, Skeleton, SkeletonCard, SkeletonText } from "@/components/ui";
import { Stage } from "@/features/onboarding/ui/Stage";
import s from "@/features/onboarding/ui/home.module.css";

export default function Loading() {
  return (
    <Stage label="Mecena">
      <LoadingRegion className={s.home}>
        <div className={s.top}>
          <Skeleton width={96} height={20} radius={6} />
          <Skeleton width={120} height={32} radius={9999} />
        </div>
        <div className={s.head}>
          <Skeleton width={160} height={14} radius={6} />
          <SkeletonText lines={3} />
        </div>
        <div className={s.data}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
        <div className={s.bottom}>
          <Skeleton width="70%" height={22} radius={6} />
          <div className={s.actions}>
            <Skeleton height={44} radius={9999} />
            <Skeleton height={44} radius={9999} />
          </div>
        </div>
      </LoadingRegion>
    </Stage>
  );
}
