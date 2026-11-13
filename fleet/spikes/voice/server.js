#!/usr/bin/env node
// Tiny local endpoint for demo.html: the browser does speech recognition and posts each FINAL
// result; the server runs the same Session as replay.js and streams updates back over SSE.
//
//   npm run serve            -> http://localhost:8787  (PORT env to change)
//
// No dependencies beyond the SDK. Sessions live in memory. Not production code.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Session } from "./src/session.js";
import { createMockLLM } from "./src/mock.js";
import { createClaudeLLM, loadApiKey, MODELS } from "./src/llm.js";
import { SCENARIOS } from "./src/transcripts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const keyInfo = process.argv.includes("--mock") ? null : loadApiKey();
const sessions = new Map(); // id -> { session, clients:Set<res>, backlog:[] }

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

function broadcast(entry, event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  entry.backlog.push(msg);
  for (const res of entry.clients) res.write(msg);
}

function createSession(mode) {
  const id = randomUUID();
  // Mock mode: the oracle matches the scripted transcript, so the demo shows the script to read aloud.
  const scenario = mode === "business" ? "business" : "painter";
  const llm = keyInfo ? createClaudeLLM(keyInfo.key) : createMockLLM(scenario);
  const session = new Session({ mode, llm });
  const entry = { session, clients: new Set(), backlog: [] };
  for (const ev of ["extracted", "dossier", "rejected", "stopped"]) session.on(ev, (d) => broadcast(entry, ev, d));
  session.on("error", (e) => broadcast(entry, "error", { message: e.message }));
  sessions.set(id, entry);
  return { id, mock: !keyInfo, script: keyInfo ? null : SCENARIOS[scenario].finals };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/demo.html")) {
      return send(res, 200, fs.readFileSync(path.join(here, "demo.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true, live: Boolean(keyInfo), models: MODELS });
    }
    if (req.method === "POST" && url.pathname === "/api/session") {
      const { mode } = await readJson(req);
      if (!["creator", "business"].includes(mode)) return send(res, 400, { error: "mode must be creator|business" });
      return send(res, 200, createSession(mode));
    }
    const entry = sessions.get(url.searchParams.get("id"));
    if (!entry) return send(res, 404, { error: "unknown session" });

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      for (const msg of entry.backlog) res.write(msg); // replay on reconnect
      entry.clients.add(res);
      req.on("close", () => entry.clients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/final") {
      const { text } = await readJson(req);
      entry.session.final(String(text ?? "").slice(0, 2000));
      return send(res, 202, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/stop") {
      entry.session.stop(); // result arrives over SSE as "stopped"
      return send(res, 202, { ok: true });
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Mecena voice spike → http://localhost:${PORT}`);
  console.log(keyInfo ? `LIVE (key from ${keyInfo.from === "environment" ? "environment" : keyInfo.from})` : "MOCK MODE: no ANTHROPIC_API_KEY found. The demo will show a script to read aloud.");
  console.log("Phone over USB: adb reverse tcp:8787 tcp:8787, then open http://localhost:8787 in Chrome for Android.");
});
