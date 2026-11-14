// First screen of the app, before signing in: creator or pyme. The choice travels to /entrar (?perfil=…).
import { KindChoice } from "@/features/auth/KindChoice";

export const metadata = { title: "Empezar · Mecena" };

export default function Page() {
  return <KindChoice />;
}
