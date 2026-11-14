/** JSON store: db.json.bak before every write, fallback to it, and a read cache that never changes what readers see. */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Db } from "@/contracts";
import { backupFile, dataDir, readDb, updateDb } from "@/server/store";

const dbFile = () => path.join(dataDir(), "db.json");

afterEach(() => vi.restoreAllMocks());

describe("db.json.bak", () => {
  it("every write keeps the previous version", async () => {
    readDb();
    await updateDb((db) => {
      db.meta.appUserId = "primera";
    });
    await updateDb((db) => {
      db.meta.appUserId = "segunda";
    });
    expect(JSON.parse(fs.readFileSync(backupFile(), "utf8")).meta.appUserId).toBe("primera");
    expect(JSON.parse(fs.readFileSync(dbFile(), "utf8")).meta.appUserId).toBe("segunda");
  });

  it("a damaged db.json is served from the backup, the next write repairs it, and the damage never reaches the backup", async () => {
    readDb();
    await updateDb((db) => {
      db.meta.appUserId = "buena";
    });
    await updateDb((db) => {
      db.meta.appUserId = "ultima";
    });
    fs.writeFileSync(dbFile(), '{"meta": {'); // e.g. disk full in the middle of a hand edit
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(readDb().meta.appUserId).toBe("buena");
    await updateDb((db) => {
      db.meta.appUserId = "reparada";
    });
    expect(Db.safeParse(JSON.parse(fs.readFileSync(dbFile(), "utf8"))).success).toBe(true);
    expect(readDb().meta.appUserId).toBe("reparada");
    expect(JSON.parse(fs.readFileSync(backupFile(), "utf8")).meta.appUserId).toBe("buena");
  });

  it("without a backup, a damaged db.json still fails loudly (no silent reset)", () => {
    readDb();
    fs.rmSync(backupFile(), { force: true });
    fs.writeFileSync(dbFile(), "nope");
    expect(() => readDb()).toThrow();
  });
});

describe("read cache", () => {
  it("parses db.json once until it changes", async () => {
    readDb();
    await updateDb((db) => {
      db.meta.appUserId = "x";
    });
    const spy = vi.spyOn(Db, "parse");
    for (let i = 0; i < 5; i++) readDb();
    expect(spy).not.toHaveBeenCalled();
    // a change on disk is parsed again, once
    const tmp = `${dbFile()}.other.tmp`;
    fs.writeFileSync(tmp, fs.readFileSync(dbFile(), "utf8").replace('"x"', '"y"'));
    fs.renameSync(tmp, dbFile());
    expect(readDb().meta.appUserId).toBe("y");
    readDb();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("every reader gets its own copy: mutating one never leaks into the next read", () => {
    const a = readDb();
    a.meta.appUserId = "mutado";
    a.profiles.length = 0;
    const b = readDb();
    expect(b.meta.appUserId).not.toBe("mutado");
    expect(b.profiles.length).toBeGreaterThan(0);
  });

  it("sees a write by another process (the MCP server renames a new file in)", async () => {
    readDb();
    const other = { ...JSON.parse(fs.readFileSync(dbFile(), "utf8")), meta: { ...readDb().meta, appUserId: "desde-mcp" } };
    const tmp = `${dbFile()}.other.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(other));
    fs.renameSync(tmp, dbFile());
    expect(readDb().meta.appUserId).toBe("desde-mcp");
  });
});
