# Mecena en Claude Desktop y Claude Code (MCP)

Mecena expone sus **8 herramientas** como servidor MCP. Son exactamente las mismas que usa el agente de la app («Pregúntale a Mecena», `POST /api/agent`): un único módulo, `src/tools/registry.ts`, con varias puertas de entrada.

| Puerta | Para qué | Datos que ve | Autenticación |
|---|---|---|---|
| **MCP remoto** `https://mecena.fly.dev/api/mcp` (Streamable HTTP) | Uso normal y **la demo**: Claude trabaja con tu cuenta real de la app | Los de la app publicada: tu perfil, tus obras, tus compras | Token personal (`Authorization: Bearer mcn_…`), creado en **Cuenta → Conectar con Claude** |
| MCP local (stdio, `npm run mcp`) | Desarrollo | Los del `MECENA_DATA_DIR` de tu ordenador | `MECENA_USER_EMAIL` (quien lanza el proceso ya tiene el disco) |
| Agente en la app (`/api/agent`) | Botón «Pregúntale» en el móvil | Los de la app | Sesión de la web |

| Herramienta | Qué hace |
|---|---|
| `get_profile` | Lee tu perfil (artista o pyme/autónomo). |
| `update_profile` | Actualiza campos del perfil (sin inventar nada). |
| `build_dossier` | Monta el dossier. Con `callId`, lo adapta a esa convocatoria (orden, límite de imágenes, textos según sus criterios): **la adaptación es de Mecena Pro**; sin Pro devuelve el dossier general con las notas de la convocatoria como vista previa, y lo dice. |
| `export_dossier_pdf` | Exporta el dossier a PDF y devuelve el enlace de descarga (se abre con tu sesión de Mecena). Con `callId` y Pro, el PDF adaptado; sin Pro, el general. |
| `search_calls` | Busca convocatorias **abiertas o próximas** que encajan contigo, con su estado en cada línea. Las recurrentes cuya edición ya cerró solo salen con `includeClosed`. **Sin Pro ves 3 convocatorias al mes** (el mismo cupo que en `/convocatorias`) y el resumen añade «Tienes N más con Mecena Pro: …/pro». |
| `explain_call` | Explica unas bases en lenguaje claro: requisitos, cuantía, plazo, documentación, criterios. Sin Pro, solo para las 3 que ya tienes desbloqueadas este mes. |
| `draft_application` | Redacta la solicitud con tus propias palabras. **Requiere Mecena Pro o una Solicitud premium.** |
| `score_application` | Pasa la solicitud por el tribunal simulado (orientativo) con los criterios oficiales. |

Cada llamada devuelve **dos bloques de texto**: un resumen corto en castellano y, después, el JSON completo. Los enlaces (`url`) usan `MECENA_PUBLIC_URL` (en Fly, `https://mecena.fly.dev`) y se abren con la sesión de tu cuenta. Los errores también llegan en castellano (datos no válidos, «no encontrado», muro de pago con el enlace a `/pro`, demasiadas peticiones).

## 1. Conectar Claude con tu cuenta de mecena.fly.dev (MCP remoto)

### Crea tu token

1. Entra en https://mecena.fly.dev con tu cuenta.
2. Toca tu inicial (arriba a la derecha) → **Conectar con Claude** (`/cuenta`).
3. Ponle un nombre («Claude Desktop», «Portátil de la demo»…) y pulsa **Crear token**.
4. Copia el token `mcn_…` **ahora**: solo se muestra una vez (guardamos su huella sha256, no el token). La misma pantalla te da ya rellenos el comando para Claude Code y el bloque para Claude Desktop.

Puedes tener hasta 10 tokens. **Revocar** uno en esa pantalla lo corta al momento. Trátalo como una contraseña: da acceso a tu cuenta (perfil, dossier, compras).

### Claude Desktop

Claude Desktop lanza los servidores MCP de su fichero de configuración como procesos locales, y sus conectores personalizados no permiten añadir una cabecera `Authorization`. Por eso usamos el puente [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), que hace de servidor stdio local y reenvía todo a la URL remota con tu cabecera. Necesitas **Node.js ≥ 18** en el ordenador (`node -v`).

1. Abre el fichero de configuración (Claude Desktop → *Ajustes* → *Desarrollador* → *Editar configuración*):
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`
2. Añade dentro de `mcpServers` el bloque `mecena` (está en [`claude_desktop_config.example.json`](./claude_desktop_config.example.json) y en la pantalla del token):

   ```json
   {
     "mcpServers": {
       "mecena": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://mecena.fly.dev/api/mcp", "--header", "Authorization:${MECENA_AUTH}"],
         "env": { "MECENA_AUTH": "Bearer mcn_PEGA_AQUI_TU_TOKEN" }
       }
     }
   }
   ```

   El token va en `env` y la cabecera se escribe `Authorization:${MECENA_AUTH}` (sin espacio tras los dos puntos): así no se rompe el argumento en Windows, donde Claude Desktop parte los argumentos por espacios.
3. **Cierra Claude Desktop del todo** (también desde la bandeja/barra de menús) y vuelve a abrirlo. En el botón de herramientas del chat debe aparecer **mecena** con 8 herramientas. La primera vez `npx` descarga `mcp-remote` (unos segundos, con Internet).

### Claude Code

Claude Code habla Streamable HTTP directamente, con la cabecera:

```bash
claude mcp add --transport http mecena https://mecena.fly.dev/api/mcp \
  --header "Authorization: Bearer mcn_PEGA_AQUI_TU_TOKEN"
# añade --scope user para tenerlo en todos tus proyectos
```

Comprueba con `claude mcp list` (debe salir `mecena … ✓ Connected`) o con `/mcp` dentro de Claude Code. Para quitarlo: `claude mcp remove mecena`.

### Prueba rápida con curl

El servidor es **sin estado** (cada `POST` es independiente, sin `Mcp-Session-Id`) y responde JSON. El cliente debe aceptar `application/json, text/event-stream`:

```bash
TOKEN=mcn_…   # tu token
H=(-H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
curl -s https://mecena.fly.dev/api/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
curl -s https://mecena.fly.dev/api/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
curl -s https://mecena.fly.dev/api/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_calls","arguments":{}}}'
```

Sin token, o con uno revocado, responde `401` con el motivo en castellano. `GET` y `DELETE` responden `405` (no hay sesiones que abrir ni cerrar).

### Límites del endpoint remoto

- 60 llamadas a herramientas por usuario cada 15 min (pasado el límite, la herramienta responde «Has hecho muchas peticiones…»).
- 30 intentos con token incorrecto por IP cada 15 min.
- Cuerpos de petición de 256 KB como máximo.

## 2. Pagos: dónde cuenta tu compra

- **App y MCP remoto** leen la misma cuenta en el mismo servidor: una compra hecha en el móvil (RevenueCat) desbloquea Pro también en Claude, en la siguiente llamada. El mensaje de pago lo dice así.
- **MCP local (stdio)** lee los datos de tu ordenador: la compra solo cuenta si la haces en la web que usa ese mismo `MECENA_DATA_DIR` (tu `npm run dev` o su túnel). Una compra en mecena.fly.dev **no** llega al MCP local; para eso, usa el MCP remoto. El mensaje de pago del MCP local lo avisa.

Sin Pro, las herramientas aplican los mismos muros que la app: 3 convocatorias al mes (`search_calls`, `explain_call`), dossier general en vez del adaptado (`build_dossier`, `export_dossier_pdf`) y `draft_application` bloqueada. Ninguna consulta sirve para rodearlos.

## 3. Guion de la demo (paso 6)

**Antes de subir al escenario**

1. En el móvil de la demo, entra en mecena.fly.dev con la cuenta de la demo, haz la entrevista y la compra sandbox (pasos 2-5): la adaptación del dossier a una convocatoria es Pro.
2. Con esa misma cuenta (en el móvil o en el portátil): **Cuenta → Conectar con Claude → Crear token** y pega el bloque en Claude Desktop del portátil (sección 1). Reinicia Claude Desktop y comprueba que salen las 8 herramientas.
3. Deja escrito en Claude Desktop (sin enviar):
   > **Hazme el dossier para los Premios Qué! Arte y pásamelo en PDF.**

   («Premios Qué! Arte 2026» está abierta hasta el 10/12/2026. Alternativa: «la convocatoria de arte plástica El Paisaje», abierta hasta el 6/12/2026.)

**En directo**

1. Envía el prompt. Claude llama a `search_calls` (para encontrar el id), `build_dossier` con ese `callId` y `export_dossier_pdf`, y responde con los enlaces.
2. Abre el enlace en el móvil (con la sesión de la cuenta de la demo): es el mismo dossier, adaptado a las bases.
3. Frase: *«Las mismas herramientas que usa la app las puede usar cualquier asistente, con tu cuenta. Mecena prepara; tú presentas.»*

Si la cuenta no es Pro, Claude devuelve el dossier general y explica que la adaptación es de Mecena Pro, con el enlace a `/pro`: también sirve para enseñar el muro de pago.

Otras frases que funcionan bien:

- «¿Qué convocatorias encajan conmigo?»
- «Explícame las bases de los Premios Qué! Arte: quién puede presentarse, cuánto dan y qué piden.»
- «Prepárame la solicitud para esa convocatoria.» (sin Pro → enlace a `/pro`; tras comprar en el móvil, vuelve a pedirlo)
- «Pásala por el tribunal y dime qué mejorarías.»
- «Añade a mi perfil que expuse en el MARCO de Vigo en 2025.»

Si el paso se recorta por tiempo, basta con mencionarlo: «y todo esto también funciona desde Claude vía MCP».

## 4. MCP local (stdio, desarrollo)

Actúa **como una sola cuenta del almacén local**: la del email de `MECENA_USER_EMAIL`. Usa su perfil activo y su suscripción, y nunca ve datos de otras cuentas (un `profileId` ajeno responde «no encontrado»).

- Requisitos: Node ≥ 22.12, `npm install` en el repo y la ruta absoluta del repo (`pwd`).
- Crea la cuenta primero en tu web local (`/entrar` → «Crear cuenta») contra el mismo `MECENA_DATA_DIR`.
- Sin `MECENA_USER_EMAIL`, o sin cuenta con ese email, el servidor **no arranca** y lo explica en stderr.
- Sin `ANTHROPIC_API_KEY` todo funciona con mocks deterministas. Carga `.env.local` y `.env` del repo.

```bash
MECENA_USER_EMAIL=tu@email.com npm --prefix /ABSOLUTE/PATH/TO/mecena run mcp
# stderr: [mecena-mcp] ready on stdio as tu@email.com (cwd …, public URL http://localhost:3000)
```

Claude Desktop: usa el bloque `mecena-local` de [`claude_desktop_config.example.json`](./claude_desktop_config.example.json) (cambia las tres rutas y el email). Claude Code:

```bash
claude mcp add mecena-local --env MECENA_PUBLIC_URL=http://localhost:3000 --env MECENA_USER_EMAIL=tu@email.com \
  -- npx --prefix /ABSOLUTE/PATH/TO/mecena tsx --tsconfig /ABSOLUTE/PATH/TO/mecena/tsconfig.json /ABSOLUTE/PATH/TO/mecena/src/mcp/server.ts
```

Para enseñar los enlaces en el móvil con el MCP local, pon en `MECENA_PUBLIC_URL` la URL de tu túnel. Para probar sin Claude: `npx @modelcontextprotocol/inspector npx --prefix /ABSOLUTE/PATH/TO/mecena tsx --tsconfig /ABSOLUTE/PATH/TO/mecena/tsconfig.json /ABSOLUTE/PATH/TO/mecena/src/mcp/server.ts`.

## 5. Agente dentro de la app («Pregúntale a Mecena»)

En el móvil, el botón **✦ Pregúntale** (abajo a la derecha, encima de la navegación) abre una hoja: escribe o dicta, y ves la respuesta con enlaces y las herramientas que ha usado. No aparece en la portada, la entrevista, `/pro` ni en las pantallas con barra de acciones (detalle de convocatoria, solicitud, tribunal).

Por debajo es `POST /api/agent` (`{ message, history }` → `{ reply, toolCalls }`), con la sesión de la web (sin ella, 401). Las herramientas se ejecutan como la cuenta de la sesión; un `appUserId` o `profileId` ajeno en el cuerpo no sirve de nada.

- **Con `ANTHROPIC_API_KEY`:** Claude (`MECENA_MODEL_FAST`, por defecto `claude-sonnet-5-5`: elegir herramientas y escribir 2-5 frases no necesita Opus; el trabajo pesado lo hacen las herramientas con su propio modelo) con las 8 herramientas y `tool_choice: auto` (nunca forzado). Topes por mensaje: 4 pasos, 1024 tokens de salida por paso, 60 000 tokens en total, los últimos 12 mensajes del historial (2000 caracteres cada uno) y el JSON de las herramientas recortado. Los errores de herramienta vuelven a Claude como `tool_result` con `is_error`.
- **Sin clave (mocks):** un enrutador por palabras clave: *tribunal/puntúa* → `score_application`; *solicitud* → `draft_application`; *dossier* → `build_dossier` (*pdf* → `export_dossier_pdf`); *explica/bases* + convocatoria conocida → `explain_call`; *convocatoria/beca/ayuda/premio* → `search_calls`; *perfil* → `get_profile`. La convocatoria se reconoce por su nombre sin importar tildes ni plurales («artes plásticas» = «arte plástica»), y si hay empate gana la que comparte la frase completa y, después, la que sigue abierta.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Claude Desktop no muestra *mecena* | JSON inválido o Claude Desktop sin reiniciar del todo. Mira el log: macOS `~/Library/Logs/Claude/mcp-server-mecena.log`, Windows `%APPDATA%\Claude\logs\mcp-server-mecena.log`. |
| `spawn npx ENOENT` | Claude Desktop no ve tu `PATH` (pasa con nvm/fnm). Pon la ruta absoluta de `npx` en `command` (`which npx` / `where npx`). |
| `401` / «Falta tu token» / «Token no válido o revocado» | Revisa `MECENA_AUTH` (`Bearer mcn_…`, con la palabra *Bearer*) o crea un token nuevo en Cuenta → Conectar con Claude. |
| `mcp-remote` abre el navegador para «autorizar» | El servidor respondió 401 (token mal copiado o revocado) y `mcp-remote` intenta OAuth. Corrige el token y reinicia Claude Desktop. |
| «Has hecho muchas peticiones…» | Límite de 60 llamadas cada 15 min por usuario. Espera unos minutos. |
| «Necesitas Mecena Pro…» / «Tienes N más con Mecena Pro» | Es el muro de pago. Compra en el móvil (sandbox) con la misma cuenta y vuelve a pedirlo. Con el MCP local, la compra tiene que hacerse en tu web local. |
| Los enlaces piden iniciar sesión | Se abren con la sesión de la cuenta del token: entra en el navegador con esa cuenta. |
| `Cannot find module 'tsx'` (local) | Falta `npm install` en el repo, o `--prefix` no apunta a la raíz del repo. |
| `MECENA_USER_EMAIL is not set` (local) | Pon el email de tu cuenta en `env` de la config (o en `.env.local`) y crea la cuenta en `/entrar` contra el mismo `MECENA_DATA_DIR`. |
| Error `Unexpected token` / el servidor local se desconecta | Algo escribió en stdout. El servidor redirige `console.log` a stderr; no añadas salidas a stdout en código que cargue el servidor MCP. |
| No salen convocatorias | Haz la entrevista con esa cuenta (el perfil empieza vacío). Las recurrentes ya cerradas solo salen si las pides. |
