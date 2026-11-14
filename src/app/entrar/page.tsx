// Sign in / create an account. Already signed in (valid session) -> straight to ?next.
import { redirect } from "next/navigation";
import { safeNext } from "@/contracts";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { signupCodeAccepted, signupCodeRequired } from "@/server/auth";
import { currentUser } from "@/server/auth/page";

export const metadata = { title: "Entrar · Mecena" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[]; cuenta?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  if (await currentUser()) redirect(next);
  return <LoginScreen next={next} signupCodeRequired={signupCodeRequired()} signupCodeAccepted={signupCodeAccepted()} initialMode={sp.cuenta === "nueva" ? "signup" : "login"} />;
}
