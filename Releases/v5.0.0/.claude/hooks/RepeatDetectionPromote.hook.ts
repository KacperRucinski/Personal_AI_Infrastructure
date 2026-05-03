#!/usr/bin/env bun
/**
 * RepeatDetectionPromote.hook.ts — Stop hook
 *
 * Promotes pending-prompt.json to last-prompt.json after Claude completes a
 * response. This keeps RepeatDetection.hook.ts anchored to prompts Claude
 * actually saw and answered.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const STATE_DIR = join(process.env.HOME || "", ".claude/PAI/MEMORY/STATE");
const LAST_PROMPT_FILE = join(STATE_DIR, "last-prompt.json");
const PENDING_PROMPT_FILE = join(STATE_DIR, "pending-prompt.json");

function main(): void {
  try {
    if (!existsSync(PENDING_PROMPT_FILE)) process.exit(0);
    const pending = JSON.parse(readFileSync(PENDING_PROMPT_FILE, "utf-8"));
    if (!pending?.prompt || !pending?.session_id) process.exit(0);

    mkdirSync(dirname(LAST_PROMPT_FILE), { recursive: true });
    writeFileSync(
      LAST_PROMPT_FILE,
      JSON.stringify({
        prompt: pending.prompt,
        session_id: pending.session_id,
        submitted_at: pending.timestamp,
        responded_at: new Date().toISOString(),
      }),
    );
    unlinkSync(PENDING_PROMPT_FILE);
  } catch {
    // Non-critical; repeat detection should never break Stop.
  }
}

main();
