// Owned by WP-06. Matched calls feed (por qué encajas / qué te falta), free plan: 3 visible.
import { PageTitle } from "@/components/ui";
import { CallsFeed } from "@/features/matching/ui/CallsFeed";

export default function Page() {
  return (
    <>
      <PageTitle kicker="Para ti">Convocatorias</PageTitle>
      <CallsFeed />
    </>
  );
}
