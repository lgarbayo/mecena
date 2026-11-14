// @vitest-environment jsdom
/** /empezar: the first screen of the app, before signing in. Only the creator/pyme choice. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Start from "@/app/empezar/page";

afterEach(cleanup);

describe("/empezar", () => {
  it("is two buttons, creator or pyme, each one to /entrar with that profile", () => {
    render(<Start />);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/entrar"));
    expect(links.map((a) => a.textContent)).toEqual(["Creador/a", "Pyme o autónomo/a"]);
    expect(screen.getByTestId("start-creator").getAttribute("href")).toBe("/entrar?cuenta=nueva&perfil=creador");
    expect(screen.getByTestId("start-business").getAttribute("href")).toBe("/entrar?cuenta=nueva&perfil=pyme");
  });
});
