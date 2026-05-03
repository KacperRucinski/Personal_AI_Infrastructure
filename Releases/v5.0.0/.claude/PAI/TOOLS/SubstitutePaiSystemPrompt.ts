#!/usr/bin/env bun
/**
 * SubstitutePaiSystemPrompt.ts
 *
 * Replaces installer identity placeholders in PAI/PAI_SYSTEM_PROMPT.md.
 * Skips inline-code spans so doctrine examples such as `("{{DA_NAME}} can")`
 * remain literal.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const CLAUDE_HOME = process.env.CLAUDE_HOME || join(process.env.HOME || "", ".claude");
const PROMPT_PATH = join(CLAUDE_HOME, "PAI", "PAI_SYSTEM_PROMPT.md");
const SETTINGS_PATH = join(CLAUDE_HOME, "settings.json");
const DA_IDENTITY_PATH = join(CLAUDE_HOME, "PAI", "USER", "DA_IDENTITY.md");
const PRINCIPAL_IDENTITY_PATH = join(CLAUDE_HOME, "PAI", "USER", "PRINCIPAL_IDENTITY.md");

type Identity = {
  daName: string;
  daFullName: string;
  principalName: string;
};

function readJson(path: string): any {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function readMarkdownName(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const text = readFileSync(path, "utf-8");
    const frontmatterName = text.match(/^---[\s\S]*?^name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
    if (frontmatterName) return frontmatterName;
    const fullName = text.match(/^\s*(?:-\s*)?\*\*Full Name:\*\*\s*(.+)$/m)?.[1]?.trim();
    if (fullName) return fullName;
    const name = text.match(/^\s*(?:-\s*)?\*\*Name:\*\*\s*(.+)$/m)?.[1]?.trim();
    if (name) return name;
  } catch {}
  return undefined;
}

function loadIdentity(): Identity {
  const settings = readJson(SETTINGS_PATH);
  const daName =
    process.env.DA_NAME ||
    settings?.daidentity?.name ||
    settings?.daidentity?.fullName ||
    settings?.da?.name ||
    readMarkdownName(DA_IDENTITY_PATH) ||
    "the DA";

  const daFullName =
    process.env.DA_FULL_NAME ||
    settings?.daidentity?.fullName ||
    settings?.daidentity?.name ||
    settings?.da?.fullName ||
    settings?.da?.name ||
    readMarkdownName(DA_IDENTITY_PATH) ||
    daName;

  const principalName =
    process.env.PRINCIPAL_NAME ||
    settings?.principal?.fullName ||
    settings?.principal?.full_name ||
    settings?.principal?.name ||
    settings?.principalName ||
    readMarkdownName(PRINCIPAL_IDENTITY_PATH) ||
    "the principal";

  return { daName, daFullName, principalName };
}

function replaceOutsideInlineCode(input: string, replacements: Record<string, string>): string {
  const parts = input.split(/(`[^`\n]*`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) return part;
      let out = part;
      for (const [from, to] of Object.entries(replacements)) out = out.split(from).join(to);
      return out;
    })
    .join("");
}

function main(): void {
  if (!existsSync(PROMPT_PATH)) {
    console.error(`PAI_SYSTEM_PROMPT.md not found: ${PROMPT_PATH}`);
    process.exit(1);
  }

  const identity = loadIdentity();
  const before = readFileSync(PROMPT_PATH, "utf-8");
  const after = replaceOutsideInlineCode(before, {
    "{{DA_NAME}}": identity.daName,
    "{{DA_FULL_NAME}}": identity.daFullName,
    "{{PRINCIPAL_NAME}}": identity.principalName,
  });

  if (after === before) {
    console.log("PAI_SYSTEM_PROMPT.md already has no substitutable identity placeholders.");
    return;
  }

  const backup = `${PROMPT_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(PROMPT_PATH, backup);
  writeFileSync(PROMPT_PATH, after);
  console.log(`Updated ${PROMPT_PATH}`);
  console.log(`Backup: ${backup}`);
}

try {
  main();
} catch (err) {
  console.error(`SubstitutePaiSystemPrompt failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
