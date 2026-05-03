#!/usr/bin/env bun
/**
 * TelosSchemaBridge.ts
 *
 * Bridges the v5 /interview TELOS layout into the flat fields expected by
 * Pulse Life Dashboard readers. Safe to run repeatedly.
 *
 * Source schema produced by /interview:
 *   PAI/USER/TELOS/IDEAL_STATE/{HEALTH,MONEY,FREEDOM,RELATIONSHIPS,CREATIVE}.md
 *   PAI/USER/TELOS/CURRENT_STATE/SNAPSHOT.md
 *
 * Compatibility outputs:
 *   PAI/USER/TELOS/IDEAL_STATE_INDEX.json
 *   PAI/USER/TELOS/CURRENT.md
 *   PAI/USER/TELOS/2036.md       when absent only, with a clear placeholder
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const CLAUDE_HOME = process.env.CLAUDE_HOME || join(process.env.HOME || "", ".claude");
const TELOS_DIR = join(CLAUDE_HOME, "PAI", "USER", "TELOS");
const IDEAL_DIR = join(TELOS_DIR, "IDEAL_STATE");
const CURRENT_DIR = join(TELOS_DIR, "CURRENT_STATE");

const IDEAL_FILES = [
  ["health", "HEALTH.md"],
  ["money", "MONEY.md"],
  ["freedom", "FREEDOM.md"],
  ["relationships", "RELATIONSHIPS.md"],
  ["creative", "CREATIVE.md"],
] as const;

type Section = {
  title: string;
  body: string;
};

type IdealStateIndex = {
  generated_at: string;
  source: "TELOS/IDEAL_STATE";
  dimensions: Record<string, { path: string; title: string; sections: Section[]; raw: string }>;
};

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const m = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push({ ...current, body: current.body.trim() });
      current = { title: m[1].trim(), body: "" };
      continue;
    }
    if (current) current.body += line + "\n";
  }

  if (current) sections.push({ ...current, body: current.body.trim() });
  return sections;
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const h1 = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  return h1 || fallback;
}

function buildIdealStateIndex(): IdealStateIndex {
  const dimensions: IdealStateIndex["dimensions"] = {};

  for (const [key, filename] of IDEAL_FILES) {
    const path = join(IDEAL_DIR, filename);
    const raw = readIfExists(path);
    dimensions[key] = {
      path: `IDEAL_STATE/${filename}`,
      title: titleFromMarkdown(raw, key.toUpperCase()),
      sections: parseSections(raw),
      raw,
    };
  }

  return { generated_at: new Date().toISOString(), source: "TELOS/IDEAL_STATE", dimensions };
}

function writeIdealStateIndex(): void {
  const out = join(TELOS_DIR, "IDEAL_STATE_INDEX.json");
  ensureParent(out);
  writeFileSync(out, JSON.stringify(buildIdealStateIndex(), null, 2) + "\n");
  console.log(`Wrote ${out}`);
}

function snapshotToCurrent(snapshot: string): string {
  if (!snapshot.trim()) return "";
  if (snapshot.includes("## Next likely actions")) return snapshot;

  return [
    "# Current State",
    "",
    "> Generated from TELOS/CURRENT_STATE/SNAPSHOT.md by TelosSchemaBridge.ts.",
    "",
    snapshot.trim(),
    "",
    "## Next likely actions",
    "",
    "1. Review CURRENT_STATE/SNAPSHOT.md and add explicit next actions.",
    "2. Run TelosSchemaBridge.ts again after updates.",
    "",
  ].join("\n");
}

function writeCurrentCompat(): void {
  const snapshotPath = join(CURRENT_DIR, "SNAPSHOT.md");
  const currentPath = join(TELOS_DIR, "CURRENT.md");
  const snapshot = readIfExists(snapshotPath);

  if (!snapshot.trim()) {
    console.log(`No CURRENT_STATE/SNAPSHOT.md found; leaving ${currentPath} unchanged.`);
    return;
  }

  ensureParent(currentPath);
  writeFileSync(currentPath, snapshotToCurrent(snapshot));
  console.log(`Wrote ${currentPath}`);
}

function writeTimelinePlaceholder(): void {
  const timelinePath = join(TELOS_DIR, "2036.md");
  if (existsSync(timelinePath)) {
    console.log(`${timelinePath} exists; leaving unchanged.`);
    return;
  }

  const content = [
    "# 2036 Timeline",
    "",
    "> Placeholder created by TelosSchemaBridge.ts because /interview does not currently produce TELOS/2036.md.",
    "> Replace this with your long-range timeline when ready.",
    "",
  ].join("\n");

  ensureParent(timelinePath);
  writeFileSync(timelinePath, content);
  console.log(`Wrote ${timelinePath}`);
}

function main(): void {
  writeIdealStateIndex();
  writeCurrentCompat();
  writeTimelinePlaceholder();
}

try {
  main();
} catch (err) {
  console.error(`TelosSchemaBridge failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
