// Owned by WP-07. Pricing page: the Mecena Pro offer and the user's current status.
import { PageTitle } from "@/components/ui";
import { ProPage } from "@/features/purchases/ui/ProPage";

export const metadata = { title: "Mecena Pro" };

export default function Page() {
  return (
    <>
      <PageTitle kicker="Mecena Pro">Consigue la ayuda, no el formulario</PageTitle>
      <ProPage />
    </>
  );
}
