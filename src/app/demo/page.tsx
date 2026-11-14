// Owned by WP-09. Demo panel (plan B), not linked from the nav: reset the signed-in user's own data, load a ready-made
// scenario into that same account, and the per-account switches (deterministic jury, simulated AI).
import { PageTitle } from "@/components/ui";
import { DemoReset } from "@/features/demo/ui/DemoReset";
import { requirePageUser } from "@/server/auth/page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requirePageUser("/demo");
  return (
    <>
      <PageTitle kicker="Demo">Panel de demo</PageTitle>
      <DemoReset email={user.email} />
    </>
  );
}
