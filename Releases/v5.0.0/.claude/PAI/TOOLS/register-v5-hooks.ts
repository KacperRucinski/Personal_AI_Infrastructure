#!/usr/bin/env bun
/**
 * register-v5-hooks.ts
 *
 * Idempotently registers v5 hooks that ship in the release but are missing from
 * settings.json, without replacing the user's whole settings file.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const CLAUDE_HOME = process.env.CLAUDE_HOME || join(process.env.HOME || "", ".claude");
const SETTINGS_PATH = join(CLAUDE_HOME, "settings.json");

type HookCommand = { type: "command"; command: string };
type HookEntry = { matcher?: string; hooks: HookCommand[] };
type Settings = { hooks?: Record<string, HookEntry[]>; [key: string]: unknown };

function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) throw new Error(`settings.json not found: ${SETTINGS_PATH}`);
  return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
}

function hasCommand(entries: HookEntry[], command: string): boolean {
  return entries.some((entry) => entry.hooks?.some((hook) => hook.type === "command" && hook.command === command));
}

function addHook(settings: Settings, event: string, matcher: string | undefined, command: string): boolean {
  settings.hooks ??= {};
  settings.hooks[event] ??= [];
  const entries = settings.hooks[event];
  if (hasCommand(entries, command)) return false;

  const compatible = entries.find((entry) => (matcher ? entry.matcher === matcher : !entry.matcher));
  const hook: HookCommand = { type: "command", command };
  if (compatible) {
    compatible.hooks ??= [];
    compatible.hooks.push(hook);
  } else {
    entries.push(matcher ? { matcher, hooks: [hook] } : { hooks: [hook] });
  }
  return true;
}

function main(): void {
  const settings = loadSettings();
  const backup = `${SETTINGS_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(SETTINGS_PATH, backup);

  const changes = [
    addHook(settings, "Stop", undefined, "$HOME/.claude/hooks/RepeatDetectionPromote.hook.ts"),
    addHook(settings, "PostToolUse", "Edit|Write", "$HOME/.claude/hooks/ISASync.hook.ts"),
    addHook(settings, "PostToolUse", "Edit|Write", "$HOME/.claude/hooks/CheckpointPerISC.hook.ts"),
    addHook(settings, "PostToolUseFailure", undefined, "$HOME/.claude/hooks/ToolFailureTracker.hook.ts"),
  ].filter(Boolean).length;

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Registered ${changes} hook(s). Backup: ${backup}`);
}

try {
  main();
} catch (err) {
  console.error(`register-v5-hooks failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
