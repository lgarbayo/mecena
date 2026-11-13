---
id: WP-04
title: Shared tools module, MCP server, in-app agent and Claude Desktop config
deps: []
owns:
  - src/tools/**
  - src/mcp/**
  - src/features/agent/**
  - src/app/api/agent/**
  - docs/mcp.md
  - docs/claude_desktop_config.example.json
  - tests/mcp/**
  - tests/agent/**
status: pending
hours: 2
criteria: [Applied AI depth, Live demo wow]
---

**Team blocks:** A7, A8 (Persona A); exposes B11 (the domain handlers `search_calls`, `explain_call`, `draft_application`, `score_application` are implemented in WP-06/WP-08 services, this WP registers, documents and tests them through both front doors). Demo beat 8 (cuttable).

## Goal
One tools module (`src/tools/registry.ts`) drives both the MCP server (stdio, for Claude Desktop / Claude Code) and the in-app agent (`POST /api/agent`, Claude tool use). A teammate can paste the config into Claude Desktop and say "hazme el dossier para la convocatoria X".

## Consumes
- `toolSchemas`, `TOOL_NAMES`, `ToolContext`, `PaymentRequiredError` (`src/contracts/tools.ts`); feature services (dossier, matching, drafting, jury) through the registry; `anthropic()`, `modelFor()`, `isMockAi()` from `src/server/ai/llm.ts`.
- `@modelcontextprotocol/sdk` 1.32 (`McpServer.registerTool`, `StdioServerTransport`; tests use `InMemoryTransport` + `Client`).

## Provides
- `createMcpServer()`, `runTool()`, `handlers`, `isToolName()` (keep exports).
- `runAgent(message, history)` → `{ reply, toolCalls }` for `POST /api/agent`.
- `docs/mcp.md` + `docs/claude_desktop_config.example.json`.

## Acceptance criteria
- [ ] MCP server lists the 8 tools with descriptions and JSON input schemas; each tool returns a short Spanish human summary **plus** the JSON (two text content blocks), and links (`url`) use `MECENA_PUBLIC_URL`. `PaymentRequiredError` → `isError: true` with "Necesitas Mecena Pro…" and the pricing URL.
- [ ] `tests/mcp/tools.test.ts` (InMemoryTransport): `search_calls` returns results for the fixture creator; `build_dossier` with a fixture callId returns a variant; `draft_application` without entitlement is an error, with `grantPro()` (tests/helpers) succeeds; `score_application` returns a total 0..100.
- [ ] Server works when launched from any cwd (already `chdir`s to the repo root and loads `.env.local`/`.env`); logs only to stderr. `npm run mcp` starts it.
- [ ] `docs/claude_desktop_config.example.json` (`npx --prefix <repo> tsx --tsconfig <repo>/tsconfig.json <repo>/src/mcp/server.ts`) and `docs/mcp.md`: setup for Claude Desktop (macOS/Windows/Linux paths), Claude Code (`claude mcp add mecena -- npx …`), demo prompts in Spanish ("hazme el dossier para la convocatoria X", "¿qué convocatorias encajan conmigo?"), troubleshooting.
- [ ] In-app agent real mode: Claude (`modelFor("smart")`) with the 8 tools (JSON schema from zod via `z.toJSONSchema`, `tool_choice: auto`, **never forced**; models claude-opus-5-5/sonnet-5-5 reject forced tool_choice), manual loop max 6 iterations, tool errors returned as `is_error` tool_result, Spanish system prompt ("Mecena prepara; tú presentas"). Mock mode: keyword router (convocatoria/beca → search_calls; dossier → build_dossier; solicitud → draft_application; tribunal/puntúa → score_application). `tests/agent/mock.test.ts` covers the router.
- [ ] `npm test` + `npm run build` green.

## Notes
- No UI is required for the agent (cut-list item 2). If time remains, a small "Pregúntale a Mecena" sheet component in `src/features/agent/ui/` that pages may mount later.
- Entitlement for MCP calls comes from the store (`meta.appUserId`), so a purchase made on the phone unlocks Claude Desktop too.

## Contract change requests
