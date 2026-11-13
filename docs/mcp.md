# Mecena en Claude Desktop y Claude Code (MCP)

Mecena expone sus **8 herramientas** como servidor MCP (stdio). Son exactamente las mismas que usa el agente de la app (`POST /api/agent`): un único módulo, `src/tools/registry.ts`, con dos puertas de entrada.

| Herramienta | Qué hace |
|---|---|
| `get_profile` | Lee tu perfil (artista o pyme/autónomo). |
| `update_profile` | Actualiza campos del perfil (sin inventar nada). |
| `build_dossier` | Monta el dossier; con `callId`, lo adapta a esa convocatoria (límite de imágenes, orden). |
| `export_dossier_pdf` | Exporta el dossier a PDF y devuelve el enlace de descarga. |
| `search_calls` | Busca convocatorias abiertas que encajan contigo, con por qué encajas y qué te falta. |
| `explain_call` | Explica unas bases en lenguaje claro: requisitos, cuantía, plazo, documentación, criterios. |
| `draft_application` | Redacta la solicitud con tus propias palabras. **Requiere Mecena Pro o una Solicitud premium.** |
| `score_application` | Pasa la solicitud por el tribunal simulado (orientativo) con los criterios oficiales. |

Cada llamada devuelve **dos bloques de texto**: un resumen corto en español y, después, el JSON completo. Los enlaces (`url`) usan `MECENA_PUBLIC_URL`, así que si apunta al túnel del móvil, el enlace que te da Claude se abre en el móvil.

Si no tienes Pro, `draft_application` devuelve un error legible: *«Necesitas Mecena Pro o una Solicitud premium… Desbloquéalo aquí: <MECENA_PUBLIC_URL>/pro»*. La compra hecha en el móvil desbloquea también Claude Desktop: el servidor MCP lee la suscripción del almacén compartido (`meta.appUserId`).

## Requisitos

- Node ≥ 22.12 y `npm install` hecho en el repo.
- Ruta absoluta del repo (en los ejemplos, `/ABSOLUTE/PATH/TO/mecena`). Sácala con `pwd` en la raíz del repo.
- Sin `ANTHROPIC_API_KEY` todo funciona con mocks deterministas. El servidor carga `.env.local` y `.env` del repo (las variables que ya vengan del entorno mandan).
- Para ver los enlaces en el navegador, arranca también la web (`npm run dev`, o `npm run dev:phone` + túnel). El servidor MCP y la web comparten el mismo almacén JSON (`data/runtime`), así que ven los cambios del otro.

Prueba rápida, desde cualquier carpeta:

```bash
npm --prefix /ABSOLUTE/PATH/TO/mecena run mcp
# stderr: [mecena-mcp] ready on stdio (cwd /ABSOLUTE/PATH/TO/mecena, public URL http://localhost:3000)
# Ctrl+C para salir. stdout es el canal MCP: el servidor solo escribe logs en stderr.
```

## Claude Desktop

1. Abre (o crea) el fichero de configuración:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`

   También puedes llegar desde Claude Desktop → *Settings* → *Developer* → *Edit Config*.
2. Copia el bloque `mecena` de [`claude_desktop_config.example.json`](./claude_desktop_config.example.json) dentro de `mcpServers` y cambia las tres apariciones de `/ABSOLUTE/PATH/TO/mecena` por la ruta del repo:

   ```json
   {
     "mcpServers": {
       "mecena": {
         "command": "npx",
         "args": [
           "--prefix", "/ABSOLUTE/PATH/TO/mecena",
           "tsx", "--tsconfig", "/ABSOLUTE/PATH/TO/mecena/tsconfig.json",
           "/ABSOLUTE/PATH/TO/mecena/src/mcp/server.ts"
         ],
         "env": { "MECENA_PUBLIC_URL": "http://localhost:3000" }
       }
     }
   }
   ```

   En Windows usa rutas con barras dobles (`"C:\\Users\\tu\\mecena"`) o barras normales (`"C:/Users/tu/mecena"`).
3. Para la demo con el móvil, pon en `MECENA_PUBLIC_URL` la URL del túnel (p. ej. `https://xxxx.trycloudflare.com`): los enlaces que devuelva Claude se abrirán en el móvil.
4. **Cierra Claude Desktop del todo** (también desde la bandeja/barra de menús) y vuelve a abrirlo. En el botón de herramientas del chat debe aparecer **mecena** con 8 herramientas.

## Claude Code

Desde cualquier carpeta (`--scope user` para tenerlo en todos tus proyectos):

```bash
claude mcp add mecena --scope user \
  --env MECENA_PUBLIC_URL=http://localhost:3000 \
  -- npx --prefix /ABSOLUTE/PATH/TO/mecena tsx \
     --tsconfig /ABSOLUTE/PATH/TO/mecena/tsconfig.json \
     /ABSOLUTE/PATH/TO/mecena/src/mcp/server.ts
```

Comprueba con `claude mcp list` (debe salir `mecena … ✓ Connected`) o con `/mcp` dentro de Claude Code. Para quitarlo: `claude mcp remove mecena --scope user`.

## Guion de la demo (beat 8, opcional)

Antes: web arrancada con el perfil de demo sembrado (`npm run demo:reset`), móvil en la URL del túnel y `MECENA_PUBLIC_URL` apuntando a ese túnel.

1. En Claude Desktop, escribe:
   > **Hazme el dossier para la convocatoria de artes plásticas de la Diputación y pásamelo en PDF.**

   Claude llama a `search_calls` (para encontrar el id), `build_dossier` con ese `callId` y `export_dossier_pdf`, y responde con el enlace.
2. Abre el enlace en el móvil: es el mismo dossier, adaptado a las bases (límite de imágenes incluido).
3. Frase para el público: *«Las mismas herramientas que usa la app las puede usar cualquier asistente. Mecena prepara; tú presentas.»*

Otras frases que funcionan bien:

- «¿Qué convocatorias encajan conmigo?»
- «Explícame las bases de la beca de artes plásticas: quién puede presentarse, cuánto dan y qué piden.»
- «Prepárame la solicitud para esa beca.» (sin Pro → Claude te enseña el enlace a `/pro`; tras comprar en el móvil, vuelve a pedirlo)
- «Pásala por el tribunal y dime qué mejorarías.»
- «Añade a mi perfil que expuse en el MARCO de Vigo en 2025.»

Si el beat se recorta por tiempo, basta con mencionarlo: «y todo esto también funciona desde Claude Desktop vía MCP».

## Agente dentro de la app (`POST /api/agent`)

```bash
curl -s localhost:3000/api/agent -H 'content-type: application/json' \
  -d '{"message":"hazme el dossier para la convocatoria de artes plásticas","history":[]}'
# → { "reply": "Dossier artístico listo: … Ábrelo aquí: http://localhost:3000/dossier?…", "toolCalls": [{ "name": "build_dossier", … }] }
```

- **Con `ANTHROPIC_API_KEY`:** Claude (`MECENA_MODEL_SMART`, por defecto `claude-opus-5-5`) con las 8 herramientas, `tool_choice: auto` (nunca forzado), bucle de hasta 6 pasos; los errores de herramienta vuelven a Claude como `tool_result` con `is_error` para que se explique o corrija.
- **Sin clave (mocks):** un enrutador por palabras clave: *tribunal/puntúa* → `score_application`; *solicitud* → `draft_application`; *dossier* → `build_dossier` (*pdf* → `export_dossier_pdf`); *explica/bases* + convocatoria conocida → `explain_call`; *convocatoria/beca/ayuda/premio* → `search_calls`; *perfil* → `get_profile`.
- Campo opcional `appUserId` en el cuerpo: usa la suscripción de ese usuario de RevenueCat; si falta, la del almacén.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Claude Desktop no muestra *mecena* | Revisa que el JSON sea válido, que las rutas sean absolutas y reinicia Claude Desktop del todo. Mira el log: macOS `~/Library/Logs/Claude/mcp-server-mecena.log`, Windows `%APPDATA%\Claude\logs\mcp-server-mecena.log`. |
| `spawn npx ENOENT` | Claude Desktop no ve tu `PATH` (pasa con nvm/fnm). Pon la ruta absoluta de `npx` en `command` (`which npx` / `where npx`). |
| `Cannot find module 'tsx'` | Falta `npm install` en el repo, o `--prefix` no apunta a la raíz del repo. |
| `process.loadEnvFile is not a function` | Node demasiado antiguo: hace falta Node ≥ 22.12. |
| Error `Unexpected token` / el servidor se desconecta | Algo escribió en stdout. El servidor redirige `console.log` a stderr; no añadas `print`/`console.log` a stdout en código que cargue el servidor MCP. |
| Los enlaces dan `localhost` en el móvil | Cambia `MECENA_PUBLIC_URL` a la URL del túnel en la config y reinicia Claude Desktop. |
| «Necesitas Mecena Pro…» | Es el paywall. Compra en el móvil (sandbox) o, en local, `POST /api/entitlements` con `{ "appUserId": "<meta.appUserId>", "pro": true }`. |
| No salen convocatorias | Ejecuta `npm run demo:reset` (perfil sembrado) o comprueba que existe `data/calls/calls.json`. |
| Probar sin Claude Desktop | `npx @modelcontextprotocol/inspector npx --prefix /ABSOLUTE/PATH/TO/mecena tsx --tsconfig /ABSOLUTE/PATH/TO/mecena/tsconfig.json /ABSOLUTE/PATH/TO/mecena/src/mcp/server.ts` |
