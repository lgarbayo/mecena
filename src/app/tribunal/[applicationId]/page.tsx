// STUB (scaffold). Owned by WP-08.
import { PageTitle, Pending } from "@/components/ui";

export default async function Page({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return (
    <>
      <PageTitle kicker="Tribunal simulado">Tu puntuación</PageTitle>
      <Pending wp="WP-08" what={`Jurado con los criterios oficiales de las bases. (${decodeURIComponent(applicationId)})`} />
    </>
  );
}
