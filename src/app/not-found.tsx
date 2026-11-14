import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <section>
      <PageTitle kicker="404">Esta página no existe</PageTitle>
      <Card>
        <p style={{ marginTop: 0, color: "var(--text-2)", lineHeight: 1.6 }}>
          No hemos encontrado la ruta que buscas. Vuelve al inicio para continuar con tu obra o tus convocatorias.
        </p>
        <Link href="/" className="btn btn-primary">
          Volver al inicio
        </Link>
      </Card>
    </section>
  );
}
