#!/usr/bin/env bun
/**
 * WritePaiState.ts
 *
 * Converts PAI/USER/TELOS/PAI_STATE_INPUT.yaml into PAI_STATE.json consumed by
 * statusline-command.sh. Deterministic and safe to run on SessionStart.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { parse as parseYaml } from "yaml";

const CLAUDE_HOME = process.env.CLAUDE_HOME || join(process.env.HOME || "", ".claude");
const TELOS_DIR = join(CLAUDE_HOME, "PAI", "USER", "TELOS");
const INPUT_PATH = join(TELOS_DIR, "PAI_STATE_INPUT.yaml");
const OUTPUT_PATH = join(TELOS_DIR, "PAI_STATE.json");

const DIMENSIONS = ["health", "creative", "freedom", "relations", "fin"] as const;
type Dimension = typeof DIMENSIONS[number];

type InputDimension = { pct?: number | null; note?: string | null };
type OutputDimension = { pct: number | null; note?: string; updated_at: string };

function clampPct(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function main(): void {
  if (!existsSync(INPUT_PATH)) {
    console.error(`PAI state input missing: ${INPUT_PATH}`);
    process.exit(0);
  }

  const raw = parseYaml(readFileSync(INPUT_PATH, "utf-8")) as Partial<Record<Dimension, InputDimension>>;
  const now = new Date().toISOString();
  const state: Record<Dimension, OutputDimension> & { updated_at?: string } = {} as Record<Dimension, OutputDimension> & { updated_at?: string };

  for (const key of DIMENSIONS) {
    const entry = raw?.[key] || {};
    const note = typeof entry.note === "string" ? entry.note : undefined;
    state[key] = { pct: clampPct(entry.pct), ...(note ? { note } : {}), updated_at: now };
  }
  state.updated_at = now;

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(state, null, 2) + "\n");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

try {
  main();
} catch (err) {
  console.error(`WritePaiState failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
