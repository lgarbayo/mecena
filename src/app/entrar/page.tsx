// Sign in / create an account. Already signed in (valid session) -> straight to ?next, switching first to the profile
// chosen on the opening screen (?perfil=creador|pyme) if there is one.
import { redirect } from "next/navigation";
import { kindFromSlug, safeNext } from "@/contracts";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { signupCodeAccepted, signupCodeRequired, switchMode } from "@/server/auth";
import { currentUser } from "@/server/auth/page";

export const metadata = { title: "Entrar · Mecena" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[]; cuenta?: string; perfil?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const kind = kindFromSlug(sp.perfil);
  const user = await currentUser();
  if (user) {
    if (kind) await switchMode(user.id, kind);
    redirect(next);
  }
  return <LoginScreen next={next} signupCodeRequired={signupCodeRequired()} signupCodeAccepted={signupCodeAccepted()} initialMode={sp.cuenta === "nueva" ? "signup" : "login"} kind={kind} />;
}
