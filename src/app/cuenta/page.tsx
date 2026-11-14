// Owned by WP-04. /cuenta: the account page. "Conectar con Claude" = personal tokens for the remote MCP server.
import { PageTitle } from "@/components/ui";
import { ConnectClaude } from "@/features/agent/ui/ConnectClaude";
import { requirePageUser } from "@/server/auth/page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requirePageUser("/cuenta");
  return (
    <>
      <PageTitle kicker={user.email}>Conectar con Claude</PageTitle>
      <ConnectClaude />
    </>
  );
}
