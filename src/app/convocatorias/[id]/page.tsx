// STUB (scaffold). Owned by WP-06.
import { PageTitle, Pending } from "@/components/ui";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageTitle kicker="Convocatoria">Detalle</PageTitle>
      <Pending wp="WP-06" what={`Bases en lenguaje claro, checklist y ganadores parecidos. (${decodeURIComponent(id)})`} />
    </>
  );
}
