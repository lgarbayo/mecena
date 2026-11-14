// Owned by WP-04. /cuenta: the account page. "Conectar con Claude" = personal tokens for the remote MCP server.
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { ROUTES } from "@/contracts";
import { ConnectClaude } from "@/features/agent/ui/ConnectClaude";
import { requirePageUser } from "@/server/auth/page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requirePageUser("/cuenta");
  return (
    <>
      <PageTitle kicker={user.email}>Conectar con Claude</PageTitle>
      <ConnectClaude />
      <Card>
        <p>
          ¿Diriges una escuela o una asociación? <Link href={ROUTES.panel}>Abre el panel de organización</Link> para seguir a varias personas creadoras, o para
          aceptar una invitación que hayas recibido.
        </p>
      </Card>
    </>
  );
}
