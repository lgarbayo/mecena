import Link from "next/link";

export default function NotFound() {
  return (
    <section>
      <h1>Esta página no existe</h1>
      <Link href="/">Volver al inicio</Link>
    </section>
  );
}
