// Owned by WP-06. Matched calls feed (por qué encajas / qué te falta), free plan: 3 visible.
import { CallsFeed } from "@/features/matching/ui/CallsFeed";
import { CallsTitle } from "@/features/matching/ui/CallsTitle";

export default function Page() {
  return (
    <>
      <CallsTitle />
      <CallsFeed />
    </>
  );
}
