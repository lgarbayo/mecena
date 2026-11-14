// IDEA #7 /justificacion/[applicationId]: invoices -> budget lines -> deviation alerts -> final memoria.
import { JustificationPage } from "@/features/justification/ui/JustificationPage";

export default async function Page({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <JustificationPage applicationId={decodeURIComponent(applicationId)} />;
}
