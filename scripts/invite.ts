// Admin CLI for sign-up invite codes (they live in db.json, next to the accounts).
//   npm run invite -- create 1HACK --label 1hack --uses 50 --credits 1 --expires 2026-12-31
//   npm run invite -- list
//   npm run invite -- delete 1HACK
// create: --label = cohort stored on each account (default: the code in lowercase); --uses = max accounts (default:
// unlimited); --credits = premium credits gifted to each new account (default 0); --expires = date or ISO (default: never).
// Codes are case-insensitive. Deleting one does not touch accounts already created with it.
// On Fly: `fly ssh console -C "sh -c 'cd /app && npx tsx scripts/invite.ts create 1HACK --uses 50 --credits 1'"`.
import { createInvite, deleteInvite, listInvites, normalizeInviteCode } from "@/server/auth/invites";

const [cmd, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
const int = (name: string) => {
  const v = flag(name);
  return v === undefined ? undefined : Number(v);
};
/** "2026-12-31" means the end of that day (UTC); a full ISO timestamp is taken as given. */
const expiry = (v: string | undefined) => (v === undefined ? undefined : /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59.999Z` : v);
const code = () => {
  const c = rest[0];
  if (!c || c.startsWith("--")) throw new Error("Falta el código. Ejemplo: npm run invite -- create 1HACK --uses 50 --credits 1");
  return c;
};

async function main() {
  if (cmd === "create") {
    const inv = await createInvite({ code: code(), label: flag("label"), maxUses: int("uses"), grantCredits: int("credits"), expiresAt: expiry(flag("expires")) });
    console.log(
      `[invite] ${inv.code} creado · cohorte «${inv.label}» · ${inv.maxUses ?? "sin límite de"} usos · ${inv.grantCredits} crédito(s) de regalo · ${inv.expiresAt ? `caduca ${inv.expiresAt}` : "no caduca"}`,
    );
  } else if (cmd === "list") {
    const rows = listInvites();
    if (!rows.length) return console.log("[invite] no hay códigos en la base de datos (MECENA_SIGNUP_CODE, si existe, sigue funcionando como código «default»)");
    for (const { invite: i, status, accounts } of rows)
      console.log(`${i.code.padEnd(20)} ${status.padEnd(9)} ${String(i.uses).padStart(3)}/${i.maxUses ?? "∞"} usos · ${accounts} cuentas «${i.label}» · regalo ${i.grantCredits} · ${i.expiresAt ? `caduca ${i.expiresAt.slice(0, 10)}` : "no caduca"}`);
  } else if (cmd === "delete") {
    const c = normalizeInviteCode(code());
    console.log((await deleteInvite(c)) ? `[invite] ${c} borrado` : `[invite] ${c} no existe`);
  } else {
    throw new Error("Uso: npm run invite -- create <CÓDIGO> [--label x] [--uses n] [--credits n] [--expires AAAA-MM-DD] | list | delete <CÓDIGO>");
  }
}

main().catch((e) => {
  console.error(`[invite] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
