// Owned by WP-06. Call detail: bases in plain Spanish, fit breakdown, checklist, criteria, CTA.
import { CallDetail } from "@/features/matching/ui/CallDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CallDetail id={decodeURIComponent(id)} />;
}
