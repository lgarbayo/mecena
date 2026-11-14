// B2B panel for schools and associations (IDEA #8). Not in the main nav: reached from /cuenta.
import { PageTitle } from "@/components/ui";
import { ROUTES } from "@/contracts";
import { myInvitations, panelOrDemo } from "@/features/panel/service";
import { PanelScreen } from "@/features/panel/ui/PanelScreen";
import { requirePageUser } from "@/server/auth/page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const user = await requirePageUser(ROUTES.panel);
  const { demo } = await searchParams;
  return (
    <>
      <PageTitle kicker="Escuelas y asociaciones">Panel de organización</PageTitle>
      <PanelScreen panel={panelOrDemo(user, { demo: demo === "1" })} mine={myInvitations(user)} />
    </>
  );
}
