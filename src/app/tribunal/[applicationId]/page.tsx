// Owned by WP-08. Simulated jury on the call's official criteria (61 → 84 in the demo).
import { JuryPage } from "@/features/jury/ui/JuryPage";

export default async function Page({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  return <JuryPage applicationId={decodeURIComponent(applicationId)} />;
}
