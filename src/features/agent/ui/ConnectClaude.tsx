"use client";
/**
 * /cuenta → "Conectar con Claude": personal tokens for the remote MCP endpoint (/api/mcp). The token is shown once,
 * with copy-ready setup for Claude Code and Claude Desktop; the list shows label, prefix and last use, and revokes.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { API } from "@/contracts";
import type { McpTokenCreated, McpTokenInfo, McpTokensResponse } from "@/contracts/api";
import { Button, Card, LoadingRegion, Skeleton, SkeletonList } from "@/components/ui";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import styles from "./connect.module.css";

/** `claude mcp add` for Claude Code (remote HTTP server with a header). */
export const claudeCodeCommand = (endpoint: string, token: string) =>
  `claude mcp add --transport http mecena ${endpoint} --header "Authorization: Bearer ${token}"`;

/** claude_desktop_config.json block: Claude Desktop reaches remote servers through mcp-remote (needs Node). */
export const claudeDesktopConfig = (endpoint: string, token: string) =>
  JSON.stringify(
    {
      mcpServers: {
        mecena: {
          command: "npx",
          args: ["-y", "mcp-remote", endpoint, "--header", "Authorization:${MECENA_AUTH}"],
          env: { MECENA_AUTH: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "nunca");

function Copy({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={styles.copy}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          },
          () => undefined,
        )
      }
    >
      {done ? "Copiado" : label}
    </button>
  );
}

function Snippet({ title, code, hint }: { title: string; code: string; hint?: string }) {
  return (
    <div className={styles.snippet}>
      <div className={styles.snippetHead}>
        <h3>{title}</h3>
        <Copy text={code} />
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ConnectClaude() {
  const [data, setData] = useState<McpTokensResponse | null>(null);
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [label, setLabel] = useState("Claude Desktop");
  const [error, setError] = useState<string | null>(null);
  // the key travels with the request: a double tap or a retried POST never mints two tokens
  const createError = useRef<unknown>(null);
  const createToken = useAction(async (idempotencyKey: string, name: string) => {
    try {
      return await apiSend<McpTokenCreated>(API.mcpTokens, { label: name }, "POST", undefined, { idempotencyKey });
    } catch (e) {
      createError.current = e;
      throw e;
    }
  });
  const revokeToken = useAction(async (idempotencyKey: string, id: string) => {
    try {
      await apiSend(API.mcpToken(id), {}, "DELETE", undefined, { idempotencyKey });
    } catch (e) {
      if (!(e instanceof ApiClientError && e.status === 404)) throw e; // already gone counts as revoked
    }
    return true;
  });
  const busy = createToken.pending;

  const load = useCallback(async () => {
    setData(await apiGet<McpTokensResponse>(API.mcpTokens));
  }, []);
  useEffect(() => {
    load().catch(() => setError("No he podido cargar tus conexiones. Recarga la página."));
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    try {
      createError.current = null;
      const made = await createToken.run(label);
      if (!made) throw createError.current ?? new Error("create");
      setCreated(made);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No he podido crear la conexión.");
    }
  };

  const revoke = async (t: McpTokenInfo) => {
    if (!window.confirm(`¿Revocar «${t.label}»? Claude dejará de poder usar Mecena con ese token.`)) return;
    try {
      if (!(await revokeToken.run(t.id))) throw new Error("revoke");
      if (created?.info.id === t.id) setCreated(null);
      await load();
    } catch {
      setError("No he podido revocarla. Inténtalo de nuevo.");
    }
  };

  const endpoint = created?.endpoint ?? data?.endpoint ?? "";
  return (
    <>
      <Card>
        <p className={styles.lead}>
          Usa Mecena desde Claude Desktop o Claude Code con tu cuenta: tu perfil, tu dossier, tus convocatorias y tu plan. Dile, por ejemplo,{" "}
          <strong>«Hazme el dossier para los Premios Qué! Arte y pásamelo en PDF»</strong>.
        </p>
        <p className={styles.endpoint}>
          Servidor MCP: <code>{endpoint || "…"}</code>
        </p>
        <form className={styles.create} onSubmit={create}>
          <label htmlFor="mcp-label">Nombre de la conexión</label>
          <div className={styles.row}>
            <input id="mcp-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Claude Desktop" />
            <Button type="submit" disabled={busy}>
              {busy ? "Creando…" : "Crear token"}
            </Button>
          </div>
        </form>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </Card>

      {created && (
        <Card className={styles.fresh}>
          <p className="kicker">Tu token · cópialo ahora</p>
          <p className={styles.hint}>Solo lo verás esta vez: guardamos una huella, no el token. Si lo pierdes, revócalo y crea otro. No lo compartas: da acceso a tu cuenta.</p>
          <div className={styles.tokenRow}>
            <code className={styles.token}>{created.token}</code>
            <Copy text={created.token} />
          </div>
          <Snippet title="Claude Code" hint="Pégalo en tu terminal." code={claudeCodeCommand(created.endpoint, created.token)} />
          <Snippet
            title="Claude Desktop"
            hint="Ajustes → Desarrollador → Editar configuración. Añade este bloque dentro de «mcpServers» (necesita Node.js) y reinicia Claude Desktop del todo."
            code={claudeDesktopConfig(created.endpoint, created.token)}
          />
        </Card>
      )}

      <Card>
        <h2 className={styles.h2}>Conexiones activas</h2>
        {!data ? (
          <LoadingRegion label="Cargando tus conexiones…">
            <SkeletonList count={2}>
              <div className={styles.skeletonRow}>
                <div>
                  <Skeleton width="55%" height={16} />
                  <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
                </div>
                <Skeleton width={84} height={36} radius={9999} />
              </div>
            </SkeletonList>
          </LoadingRegion>
        ) : data.tokens.length === 0 ? (
          <p className={styles.hint}>Todavía no has conectado Claude.</p>
        ) : (
          <ul className={styles.list}>
            {data.tokens.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.label}</strong> <code>{t.prefix}</code>
                  <p className={styles.meta}>
                    Creado: {fmt(t.createdAt)} · Último uso: {fmt(t.lastUsedAt)}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => void revoke(t)} disabled={revokeToken.pending}>
                  Revocar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
