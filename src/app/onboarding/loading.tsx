// Owned by WP-01: the onboarding's first screen while it loads (segmented control, question, the two choices).
import { LoadingRegion, Skeleton, SkeletonCard, SkeletonText } from "@/components/ui";
import { Stage } from "@/features/onboarding/ui/Stage";
import s from "@/features/onboarding/ui/steps.module.css";

export default function Loading() {
  return (
    <Stage label="Cuéntanos">
      <LoadingRegion className={s.wrap}>
        <div className={s.topRow}>
          <Skeleton width={96} height={20} radius={6} />
          <Skeleton width={36} height={36} radius={9999} />
        </div>
        <div className={`${s.body} ${s.chooseBody}`}>
          <Skeleton width="100%" height={40} radius={9999} style={{ maxWidth: "22rem" }} />
          <div className={s.chooseHead}>
            <SkeletonText lines={2} />
          </div>
          <Skeleton height={48} radius={12} />
          <div className={s.choices}>
            <SkeletonCard lines={2} media={44} />
            <SkeletonCard lines={2} media={44} />
          </div>
        </div>
      </LoadingRegion>
    </Stage>
  );
}
