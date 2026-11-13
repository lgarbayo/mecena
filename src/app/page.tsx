// STUB (scaffold). Owned by WP-01: opening data screen (2 sourced data points) + trust line + CTA to voice onboarding.
import Link from "next/link";
import { ROUTES } from "@/contracts";

export default function Home() {
  return (
    <section>
      <p className="kicker">Mecena</p>
      <h1>Tú creas. Mecena se encarga del papeleo.</h1>
      <p>Becas, premios, residencias y subvenciones para artistas, pymes y autónomos.</p>
      <Link className="btn btn-primary" href={ROUTES.onboarding}>
        Empezar hablando
      </Link>
    </section>
  );
}
