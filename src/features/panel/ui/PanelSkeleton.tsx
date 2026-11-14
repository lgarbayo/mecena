// Content-shaped placeholder for /panel: summary card with three stats, deadlines and member rows on hairlines.
import { Card, LoadingRegion, Skeleton } from "@/components/ui";
import styles from "./panel.module.css";

function Row() {
  return (
    <div className={styles.skRow}>
      <div className={styles.skMain}>
        <Skeleton width="65%" height={16} radius={8} />
        <Skeleton width="40%" height={12} radius={6} />
      </div>
      <Skeleton width={72} height={24} radius={9999} />
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <LoadingRegion label="Cargando el panel…">
      <Card>
        <Skeleton width="55%" height={20} radius={8} style={{ marginBottom: 12 }} />
        <Skeleton width="100%" height={12} radius={6} style={{ marginBottom: 6 }} />
        <Skeleton width="80%" height={12} radius={6} />
        <div className={styles.stats}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={84} radius={12} />
          ))}
        </div>
      </Card>
      <Card>
        <Skeleton width="45%" height={28} radius={8} style={{ marginBottom: 8 }} />
        <Row />
        <Row />
        <Row />
      </Card>
      <Card>
        <Skeleton width="35%" height={22} radius={8} style={{ marginBottom: 8 }} />
        <Row />
        <Row />
      </Card>
    </LoadingRegion>
  );
}
