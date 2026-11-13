// Owned by WP-08. Draft written from the user's own words, behind the paywall.
import { DraftPage } from "@/features/drafting/ui/DraftPage";

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return <DraftPage callId={decodeURIComponent(callId)} />;
}
