// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Home from "@/app/page";
import TrustRoute from "@/app/confianza/page";

afterEach(cleanup);

const SOURCES = [
  "https://masdearte.com/especiales/estudio-sobre-la-situacion-economica-de-los-artistas-en-espana/",
  "https://www.bolsamania.com/noticias_amp/economia/economia--el-empleo-en-el-sector-cultural-aumenta-un-17-tras-la-pandemia-frente-al-8-del-conjunto-de-la-economia--19731138.html",
  "https://www.muypymes.com/2025/10/02/mitad-pymes-ayudas-publicas-desconocimiento",
];

describe("/ opening data screen", () => {
  it("shows the 3 sourced data points, the slogan and a CTA to /onboarding", () => {
    render(<Home />);
    const list = screen.getByTestId("data-points");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const hrefs = within(list).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(SOURCES);
    expect(list.textContent).toContain("salario mínimo");
    expect(list.textContent).toContain("34 %");
    expect(list.textContent).toContain("16 %");
    expect(list.textContent).toContain("1 de cada 4");
    expect(screen.getByText("Tú creas. Mecena se encarga del papeleo.")).toBeTruthy();
    expect(screen.getByTestId("home-cta").getAttribute("href")).toBe("/onboarding");
  });
});

describe("/confianza", () => {
  it("expands the trust promise", () => {
    render(<TrustRoute />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("El arte es tuyo; nosotros hacemos el papeleo.");
    const text = screen.getByTestId("trust-points").textContent ?? "";
    expect(text).toMatch(/Nunca generamos ni modificamos obra/);
    expect(text).toMatch(/recortamos, enderezamos y corregimos el color/);
    expect(text).toMatch(/No entrenamos con tu obra/);
    expect(text).toMatch(/última palabra/);
  });
});
