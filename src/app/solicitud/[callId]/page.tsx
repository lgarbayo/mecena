// STUB (scaffold). Owned by WP-08.
import { PageTitle, Pending } from "@/components/ui";

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return (
    <>
      <PageTitle kicker="Solicitud">Prepárame la solicitud</PageTitle>
      <Pending wp="WP-08" what={`Borrador escrito con tus palabras (tras el paywall). (${decodeURIComponent(callId)})`} />
    </>
  );
}
