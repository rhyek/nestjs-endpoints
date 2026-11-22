#!/usr/bin/env node
// The eval's PreToolUse hook for Bash: runs a command only when every part of it reads, and
// refuses everything else. The agent under test is asked to add and change endpoints; the eval
// grades what it read before it acted, so nothing it runs may change the workspace or reach
// anything outside it. A refused command still appears in the transcript.
//
//   echo '{"tool_input":{"command":"ls apps"}}' | node guard.ts
import { readFileSync } from 'node:fs';

/** Programs that only read what they are given. */
const READERS = new Set([
  'cat', 'head', 'tail', 'less', 'wc', 'ls', 'tree', 'pwd', 'echo', 'printf', 'file', 'stat',
  'realpath', 'readlink', 'dirname', 'basename', 'grep', 'egrep', 'rg', 'sort', 'uniq', 'cut',
  'tr', 'jq', 'cd', 'true', 'diff', 'test', '[',
]); // oxfmt-ignore

/** Splits on `;`, `&&`, `||`, `|` and newlines outside quotes; `null` when it can't be read safely. */
export function segments(command: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    const next = command[i + 1];
    if (quote) {
      if (quote === '"' && (c === '`' || (c === '$' && next === '('))) {
        return null;
      }
      if (c === quote) {
        quote = null;
      }
      cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === '`' || (c === '$' && next === '(') || (c === '<' && next === '(')) {
      return null;
    } else if (c === ';' || c === '\n' || c === '(' || c === ')') {
      out.push(cur);
      cur = '';
    } else if ((c === '&' && next === '&') || (c === '|' && next === '|')) {
      out.push(cur);
      cur = '';
      i++;
    } else if (c === '|') {
      out.push(cur);
      cur = '';
    } else if (c === '&' && command[i - 1] !== '>' && next !== '>') {
      return null; // backgrounds a command
    } else {
      cur += c;
    }
  }
  if (quote) {
    return null;
  }
  out.push(cur);
  return out.map((segment) => segment.trim()).filter(Boolean);
}

/** The words of a segment, with their quotes taken off. */
function words(segment: string): string[] {
  return (segment.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((word) =>
    /^(['"]).*\1$/.test(word) ? word.slice(1, -1) : word,
  );
}

/** Whether one segment only reads. */
function reads(segment: string): boolean {
  // the only redirections allowed are of output to nowhere, and of stderr to stdout
  const plain = segment.replaceAll(/\s*(2>&1|2?>\s*\/dev\/null)/g, '');
  if (/[<>]/.test(plain.replaceAll(/'[^']*'|"[^"]*"/g, ''))) {
    return false;
  }
  const [head, ...args] = words(plain);
  if (head === undefined) {
    return true;
  }
  if (READERS.has(head)) {
    return true;
  }
  if (head === 'find') {
    return !args.some((arg) => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(arg));
  }
  if (head === 'sed') {
    return !args.some((arg) => /^(-i|--in-place)/.test(arg));
  }
  // how the agent files say to find an API's docs: `node -p "require.resolve('…')"`
  if (head === 'node') {
    return (
      args.length === 2 &&
      /^(-p|-e|--print|--eval)$/.test(args[0]!) &&
      /^\s*(console\.log\()?\s*(require\.resolve|import\.meta\.resolve)\(\s*(['"])[\w@./-]+\3\s*\)\s*\)?\s*;?\s*$/.test(
        args[1]!,
      )
    );
  }
  return false;
}

/** Whether the whole command may run. */
export function allowed(command: string): boolean {
  const parts = segments(command);
  return parts !== null && parts.every(reads);
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, 'utf8')) as { tool_input?: { command?: string } };
  const ok = allowed(input.tool_input?.command ?? '');
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: ok ? 'allow' : 'deny',
        permissionDecisionReason: ok
          ? 'allowed by the eval'
          : 'Permission to run this command was denied.',
      },
    }),
  );
}
