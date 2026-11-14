// /entrar while the session check runs: the centred sign-in card, as a skeleton.
import { LoadingRegion, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando…">
      <div style={{ maxWidth: 420, margin: "24px auto 0" }}>
        <Skeleton width={80} height={13} />
        <Skeleton width="70%" height={40} style={{ marginTop: 10 }} />
        <Skeleton width="55%" height={16} style={{ marginTop: 14 }} />
        <div className="card" style={{ marginTop: 20, display: "grid", gap: 16 }}>
          <Skeleton height={42} radius={9999} />
          <Skeleton height={44} radius={12} />
          <Skeleton height={44} radius={12} />
          <Skeleton height={44} radius={9999} />
        </div>
      </div>
    </LoadingRegion>
  );
}
