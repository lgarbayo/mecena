// Owned by WP-09. Demo panel: reset the signed-in user's own data (POST /api/demo/reset).
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
