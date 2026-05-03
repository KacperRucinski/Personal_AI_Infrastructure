#!/usr/bin/env bun
/**
 * GenerateTelosSummary.ts — Reads TELOS source files and generates a compressed
 * summary for boot context loading.
 *
 * Usage: bun run ~/.claude/PAI/TOOLS/GenerateTelosSummary.ts
 *
 * Reads from: ~/.claude/PAI/USER/TELOS/*.md
 * Writes to:  ~/.claude/PAI/USER/TELOS/PRINCIPAL_TELOS.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CLAUDE_HOME = join(process.env.HOME || '', '.claude');
const TELOS_DIR = join(CLAUDE_HOME, 'PAI/USER/TELOS');
const OUTPUT_PATH = join(TELOS_DIR, 'PRINCIPAL_TELOS.md');
const SETTINGS_PATH = join(CLAUDE_HOME, 'settings.json');

interface ParsedItem {
  id: string;
  text: string;
  section?: string;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.substring(0, max).replace(/\s+\S*$/, '');
  return cut + '...';
}

function cleanText(text: string): string {
  return text.trim().replace(/^\*\*\s*/, '').replace(/\s+/g, ' ').trim();
}

function readTelosFile(filename: string): string {
  const path = join(TELOS_DIR, filename);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8');
}

function getPrincipalName(): string {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    return settings?.principal?.fullName || settings?.principal?.full_name || settings?.principal?.name || settings?.principalName || 'Principal';
  } catch {
    return 'Principal';
  }
}

/**
 * Parse ID-bearing items from both canonical PAI formats:
 *   - **M0:** text      colon inside bold, shipped v5 template
 *   - **M0**: text      colon outside bold
 *   - M0: text
 *   ### M0: text        header form from interview/manual edits
 */
function parseItems(content: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  let section = '';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      const headerItem = section.match(/^([A-Z]+\d+):\s*(.+?)(?:\s*\(.*\))?\s*$/);
      if (headerItem) items.push({ id: headerItem[1], text: cleanText(headerItem[2]), section });
      continue;
    }

    const bullet = line.match(/^-\s+(?:\*\*)?([A-Z]+\d+)(?::\*\*|\*\*:|\*\*:\s*|:)\s*(.+)$/);
    if (bullet) items.push({ id: bullet[1], text: cleanText(bullet[2]), section });
  }

  return items;
}

function parsePlainBulletsBySection(content: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let section = 'Unsectioned';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      sections[section] ??= [];
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (!bullet) continue;
    if (/^(?:\*\*)?[A-Z]+\d+(?::\*\*|\*\*:|\*\*:\s*|:)\s+/.test(bullet[1])) continue;
    sections[section] ??= [];
    sections[section].push(cleanText(bullet[1]));
  }

  return sections;
}

function parseMissions(): string[] {
  return parseItems(readTelosFile('MISSION.md'))
    .filter(i => i.id.startsWith('M'))
    .map(i => `- **${i.id}**: ${truncate(i.text, 75)}`);
}

function parseGoals(): { active: string[]; deferred: string[]; completed: string[] } {
  const content = readTelosFile('GOALS.md');
  const active: string[] = [];
  const deferred: string[] = [];
  const completed: string[] = [];

  for (const item of parseItems(content).filter(i => i.id.startsWith('G'))) {
    const firstSentence = item.text.split(/\s—\s|(?<!\w\.\w)(?<=\w)\.\s/)[0].trim();
    const formatted = `- **${item.id}**: ${truncate(firstSentence, 70)}`;
    const section = (item.section || '').toLowerCase();

    if (section.includes('completed')) completed.push(formatted);
    else if (section.includes('deferred') || section.includes('ongoing')) deferred.push(formatted);
    else active.push(formatted);
  }

  for (const [sectionName, bullets] of Object.entries(parsePlainBulletsBySection(content))) {
    const section = sectionName.toLowerCase();
    const formatted = bullets.map(b => `- ${truncate(b, 70)}`);
    if (section.includes('completed')) completed.push(...formatted);
    else if (section.includes('deferred') || section.includes('ongoing')) deferred.push(...formatted);
  }

  return { active, deferred, completed };
}

function parseProblems(): string[] {
  return parseItems(readTelosFile('PROBLEMS.md'))
    .filter(i => i.id.startsWith('P'))
    .map(i => `- **${i.id}**: ${truncate(i.text, 60)}`);
}

function parseStrategies(): string[] {
  return parseItems(readTelosFile('STRATEGIES.md'))
    .filter(i => i.id.startsWith('S'))
    .map(i => `- **${i.id}**: ${truncate(i.text, 60)}`);
}

function parseNarratives(): { primary: string[]; secondary: string[] } {
  const primary: string[] = [];
  const secondary: string[] = [];

  for (const item of parseItems(readTelosFile('NARRATIVES.md')).filter(i => i.id.startsWith('N'))) {
    const num = parseInt(item.id.replace(/\D/g, ''), 10);
    if ([0, 1, 7].includes(num)) primary.push(`- **${item.id}**: ${truncate(item.text, 75)}`);
    else secondary.push(`${item.id}: ${truncate(item.text, 60)}`);
  }

  return { primary, secondary };
}

function parseChallenges(): string[] {
  return parseItems(readTelosFile('CHALLENGES.md'))
    .filter(i => i.id.startsWith('C'))
    .map(i => `- **${i.id}**: ${truncate(i.text, 90)}`);
}

function parseWrong(): string[] {
  const out: string[] = [];
  for (const line of readTelosFile('WRONG.md').split('\n')) {
    const m = line.trim().match(/^-\s+(.+)$/);
    if (m) out.push(`- ${truncate(cleanText(m[1]), 110)}`);
  }
  return out;
}

function parseTraumas(): string[] {
  const content = readTelosFile('TRAUMAS.md');
  const items = parseItems(content).filter(i => i.id.startsWith('TR'));
  if (items.length > 0) return items.map(i => `- **${i.id}**: ${truncate(i.text, 90)}`);

  const headers = [...content.matchAll(/^###\s+(.+?)\s*$/gm)];
  return headers.map((m, i) => `- **TR${i}**: ${truncate(cleanText(m[1]), 90)}`);
}

function parseModels(): string[] {
  return parseItems(readTelosFile('MODELS.md')).slice(0, 3).map(i => {
    const first = i.text.split(/\.\s/)[0].trim();
    return `- ${truncate(first, 65)}`;
  });
}

function generate(): string {
  const now = new Date().toISOString();
  const principalName = getPrincipalName();
  const missions = parseMissions();
  const goals = parseGoals();
  const problems = parseProblems();
  const strategies = parseStrategies();
  const narratives = parseNarratives();
  const challenges = parseChallenges();
  const wrong = parseWrong();
  const traumas = parseTraumas();
  const models = parseModels();

  const lines: string[] = [
    `# Principal TELOS — ${principalName}`,
    '',
    '> Auto-generated from TELOS source files. Do not edit manually.',
    `> Generated: ${now} | Sources: MISSION, GOALS, PROBLEMS, STRATEGIES, NARRATIVES, CHALLENGES, WRONG, TRAUMAS, MODELS`,
    '',
    '## Missions',
    '',
    ...missions,
    '',
    '## Active Goals',
    '',
    ...goals.active,
  ];

  if (goals.deferred.length > 0) lines.push('', '## Deferred / Ongoing Goals', '', ...goals.deferred);
  if (goals.completed.length > 0) lines.push('', '## Completed Goals', '', ...goals.completed);

  lines.push(
    '',
    '## Problems Being Solved',
    '',
    ...problems,
    '',
    '## Strategies',
    '',
    ...strategies,
    '',
    '## Active Narratives',
    '',
    ...narratives.primary,
  );

  if (narratives.secondary.length > 0) lines.push(...narratives.secondary.map(n => `- ${n}`));
  lines.push('', '## Personal Challenges', '', ...challenges);
  if (traumas.length > 0) lines.push('', '## Formative Experiences (Traumas)', '', ...traumas);
  if (wrong.length > 0) lines.push('', '## Things I\'ve Been Wrong About (Mistakes)', '', ...wrong);
  lines.push('', '## Core Models', '', ...models, '', '## Context Filter', '', 'When steering work, bias toward: human flourishing, Human 3.0 transition, AI augmentation strategies, becoming one\'s full self, correct framing.');

  return lines.join('\n') + '\n';
}

const summary = generate();
writeFileSync(OUTPUT_PATH, summary);
const lineCount = summary.split('\n').length;
console.log(`✅ Generated PRINCIPAL_TELOS.md (${lineCount} lines) at ${OUTPUT_PATH}`);
console.error(`📋 TELOS summary regenerated: ${lineCount} lines from source files`);
