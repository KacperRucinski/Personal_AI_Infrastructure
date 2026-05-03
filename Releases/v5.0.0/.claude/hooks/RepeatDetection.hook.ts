#!/usr/bin/env bun
/**
 * RepeatDetection.hook.ts — UserPromptSubmit hook
 *
 * Compares the current prompt against the last prompt Claude actually
 * responded to. The current prompt is saved as pending and promoted by
 * RepeatDetectionPromote.hook.ts on Stop. Cancelled or blocked prompts do not
 * poison the comparison baseline.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const STATE_DIR = join(process.env.HOME || "", ".claude/PAI/MEMORY/STATE");
const LAST_PROMPT_FILE = join(STATE_DIR, "last-prompt.json");
const PENDING_PROMPT_FILE = join(STATE_DIR, "pending-prompt.json");

interface HookInput {
  session_id: string;
  message?: { content?: string; role?: string };
  prompt?: string;
}

type PromptState = { prompt?: string; session_id?: string; timestamp?: string };

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
}

function grams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= tokens.length - 3; i++) out.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  for (let i = 0; i <= tokens.length - 2; i++) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function readState(path: string): PromptState {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function savePending(prompt: string, sessionId: string): void {
  try {
    mkdirSync(dirname(PENDING_PROMPT_FILE), { recursive: true });
    writeFileSync(PENDING_PROMPT_FILE, JSON.stringify({ prompt, session_id: sessionId, timestamp: new Date().toISOString() }));
  } catch {}
}

function main(): void {
  let input: HookInput;
  try {
    input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
  } catch {
    process.exit(0);
  }

  const currentPrompt = input.prompt || input.message?.content || "";
  savePending(currentPrompt, input.session_id);

  if (currentPrompt.length < 20) process.exit(0);

  const previous = readState(LAST_PROMPT_FILE);
  const previousPrompt = previous.prompt || "";
  if (previous.session_id !== input.session_id || !previousPrompt) process.exit(0);

  const similarity = jaccard(grams(tokenize(currentPrompt)), grams(tokenize(previousPrompt)));

  if (similarity >= 0.6) {
    process.stderr.write(
      `⚠️ REPEAT DETECTION: This message is ${Math.round(similarity * 100)}% similar to the last responded-to message. ` +
      `The user may be repeating a request you missed. STOP. Re-read their message carefully and address the actual request.`
    );
    process.exit(2);
  }
}

main();
