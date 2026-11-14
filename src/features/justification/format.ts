/** Money helpers, safe for the browser (rules.ts uses node:crypto and stays server-side). */
export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
export const euros = (n: number) => `${round2(n).toLocaleString("es-ES", { useGrouping: "always", minimumFractionDigits: Number.isInteger(round2(n)) ? 0 : 2 })} €`;

