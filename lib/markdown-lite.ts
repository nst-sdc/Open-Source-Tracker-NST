/**
 * lib/markdown-lite.ts
 *
 * A deliberately small markdown parser for model output.
 *
 * Two constraints shaped it:
 *
 * 1. Zero new dependencies (repo policy), so no marked/remark/DOMPurify.
 * 2. `next.config.ts` ships `script-src 'self' 'unsafe-inline'`, which means
 *    CSP is NOT a backstop for injected markup. This parser plus a renderer
 *    that only ever constructs React elements — never
 *    dangerouslySetInnerHTML — is the entire XSS defence for anything the
 *    model emits.
 *
 * So the supported subset is chosen, not accidental. It is the GitHub
 * flavour a well-written technical post uses: headings, paragraphs, bold,
 * italic, strikethrough, inline code, fenced code, ordered / bulleted /
 * task / one-level-nested lists, tables, blockquotes (rendered as callouts
 * when they open with **Note:** / **Tip:** / **Warning:**), horizontal rules
 * and links. Everything outside it stays literal text: no raw HTML and no
 * images. Dropping images removes the onerror handler and tracking-pixel
 * vectors outright rather than trying to sanitize them.
 *
 * Pure: no React, no DOM. Unit-testable in a node environment.
 */

/** Inputs longer than this are truncated before parsing. */
export const MAX_MARKDOWN_CHARS = 20_000;

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'break' }
  | { type: 'link'; href: string; external: boolean; host?: string; children: Inline[] };

export interface ListItem {
  children: Inline[];
  /** Set for task-list items: `- [ ]` is false, `- [x]` is true. */
  checked?: boolean;
  /** One level of nesting, indented by two or more spaces under the item. */
  sublist?: ListBlock;
  /** Indented blocks that belong to the item — typically a fenced code
   *  block under a step ("2. Clone it:" followed by the command). */
  blocks?: Block[];
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  /** First number of an ordered list, when it does not start at 1. */
  start?: number;
  items: ListItem[];
}

export type Align = 'left' | 'center' | 'right' | null;

export type CalloutKind = 'note' | 'tip' | 'warning';

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4; children: Inline[] }
  | { type: 'code'; lang: string | null; value: string }
  | ListBlock
  | { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { type: 'quote'; kind: CalloutKind | null; children: Block[] }
  | { type: 'hr' };

/**
 * The href allowlist, enforced here in the parser rather than in the
 * renderer — a link whose target is not obviously safe never becomes a link
 * node at all, so no downstream consumer can reintroduce it.
 *
 * Allowed: absolute https, and site-relative paths. Everything else
 * (javascript:, data:, vbscript:, protocol-relative //host, mailto:, http:)
 * degrades to plain text.
 */
export function safeHref(
  raw: string,
): { href: string; external: boolean; host?: string } | null {
  // Strip the whitespace and control characters browsers tolerate inside a
  // scheme - `java\nscript:` is a real bypass against naive prefix checks.
  const cleaned = raw.replace(/[\u0000-\u0020\u007F]/g, '');
  if (cleaned.length === 0 || cleaned.length > 2048) return null;

  if (cleaned.startsWith('//')) return null; // protocol-relative: absolute in disguise
  if (cleaned.startsWith('/')) {
    if (cleaned.includes('\\')) return null;
    // Resolve before testing. A browser reads `/x/../api/auth/logout` as
    // `/api/auth/logout`, and that route is a GET that evicts the caller's
    // token from the pool - one attacker-authored link plus one click is a
    // forced logout. A prefix test on the raw string misses it entirely.
    let path: string;
    try {
      path = new URL(cleaned, 'https://x.invalid').pathname;
    } catch {
      return null;
    }
    if (/^\/api\//i.test(path)) return null;
    return { href: cleaned, external: false };
  }

  // Parse rather than pattern-match: the URL parser is the same one the
  // browser will use, so it cannot disagree with what actually gets fetched.
  let u: URL;
  try {
    u = new URL(cleaned);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  // `https://github.com@evil.example/x` renders as a GitHub link and navigates
  // to evil.example - everything before the @ is userinfo, not a host.
  if (u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  // Punycode labels let a lookalike domain render as the real one. This also
  // rejects every legitimate internationalized domain, which is the right
  // trade for a GitHub-centric tool serving one campus - do not "fix" it
  // without replacing it with a real confusables check.
  if (u.hostname.split('.').some((label) => label.startsWith('xn--'))) return null;

  return { href: u.toString(), external: true, host: u.hostname };
}

function pushText(out: Inline[], value: string): void {
  if (!value) return;
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.value += value;
  else out.push({ type: 'text', value });
}

/**
 * Bare URLs the model writes without link syntax. Only https, and the match
 * stops before trailing punctuation a sentence would add, so "see
 * https://x.dev/docs." links to /docs, not /docs. — the same trim GitHub does.
 */
const BARE_URL = /^https:\/\/[^\s<>[\]`]+/;
const TRAILING_PUNCT = /[.,;:!?'"]+$/;

/** True when a `*` / `_` at this position can open emphasis (not a word-internal `_`). */
function canOpen(input: string, i: number, ch: string): boolean {
  const next = input[i + 1];
  if (next === undefined || /\s/.test(next) || next === ch) return false;
  if (ch === '_') {
    const prev = input[i - 1];
    if (prev !== undefined && /[A-Za-z0-9]/.test(prev)) return false; // snake_case
  }
  return true;
}

/** Finds the closing delimiter, requiring a non-space before it. */
function findClose(input: string, from: number, delim: string, ch: string): number {
  let at = input.indexOf(delim, from + 1); // at least one character of content
  while (at > 0) {
    const before = input[at - 1];
    const after = input[at + delim.length];
    const wordAfter = ch === '_' && after !== undefined && /[A-Za-z0-9]/.test(after);
    if (before && !/\s/.test(before) && !wordAfter) return at;
    at = input.indexOf(delim, at + 1);
  }
  return -1;
}

/**
 * Inline scanner. Any delimiter without a partner is emitted as literal
 * text and the scan advances one character, so unterminated `**` or a run of
 * 5,000 asterisks degrades instead of hanging or throwing.
 */
export function parseInline(input: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  if (depth > 4) {
    pushText(out, input);
    return out;
  }

  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    // Backslash escapes: `\*` is a literal asterisk.
    if (ch === '\\' && i + 1 < input.length && /[\\`*_~\[\]()#>|-]/.test(input[i + 1])) {
      pushText(out, input[i + 1]);
      i += 2;
      continue;
    }

    if (ch === '`') {
      // A run of backticks opens a span closed by an equal run, so a single
      // backtick can live inside a double-backtick span.
      let run = 1;
      while (input[i + run] === '`') run++;
      const fence = '`'.repeat(run);
      const end = input.indexOf(fence, i + run);
      if (end > i + run - 1 && end > i) {
        const value = input.slice(i + run, end);
        if (value.length > 0) {
          out.push({ type: 'code', value: value.replace(/^ (?=\S)|(?<=\S) $/g, '') });
          i = end + run;
          continue;
        }
      }
      pushText(out, fence);
      i += run;
      continue;
    }

    if (ch === '<' && input.startsWith('<https://', i)) {
      const close = input.indexOf('>', i + 1);
      if (close > i) {
        const target = safeHref(input.slice(i + 1, close));
        if (target) {
          out.push({ type: 'link', ...target, children: [{ type: 'text', value: input.slice(i + 1, close) }] });
          i = close + 1;
          continue;
        }
      }
    }

    if (ch === 'h' && input.startsWith('https://', i) && (i === 0 || !/[A-Za-z0-9/]/.test(input[i - 1]))) {
      const m = input.slice(i).match(BARE_URL);
      if (m) {
        let raw = m[0].replace(TRAILING_PUNCT, '');
        // Balance a closing paren the sentence added: "(see https://x/y)".
        while (raw.endsWith(')') && (raw.match(/\(/g)?.length ?? 0) < (raw.match(/\)/g)?.length ?? 0)) {
          raw = raw.slice(0, -1).replace(TRAILING_PUNCT, '');
        }
        const target = safeHref(raw);
        if (target && raw.length > 8) {
          out.push({ type: 'link', ...target, children: [{ type: 'text', value: raw }] });
          i += raw.length;
          continue;
        }
      }
    }

    if (ch === '[') {
      const closeText = input.indexOf(']', i + 1);
      if (closeText > i && input[closeText + 1] === '(') {
        const closeHref = input.indexOf(')', closeText + 2);
        if (closeHref > closeText) {
          const label = input.slice(i + 1, closeText);
          // `[text](url "title")` — the title is dropped, the URL kept.
          const rawTarget = input.slice(closeText + 2, closeHref).trim().split(/\s+/)[0] ?? '';
          const target = safeHref(rawTarget);
          if (target) {
            out.push({
              type: 'link',
              href: target.href,
              external: target.external,
              host: target.host,
              children: parseInline(label, depth + 1),
            });
            i = closeHref + 1;
            continue;
          }
          // Unsafe target: keep the whole thing as visible text so the
          // student can see what was suggested without it being clickable.
          pushText(out, input.slice(i, closeHref + 1));
          i = closeHref + 1;
          continue;
        }
      }
    }

    if ((ch === '*' || ch === '_') && input[i + 1] === ch && canOpen(input, i + 1, ch)) {
      const delim = ch + ch;
      const end = findClose(input, i + 2, delim, ch);
      if (end > i + 1) {
        out.push({ type: 'strong', children: parseInline(input.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && canOpen(input, i, ch)) {
      const end = findClose(input, i + 1, ch, ch);
      if (end > i) {
        out.push({ type: 'em', children: parseInline(input.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }

    if (ch === '~' && input[i + 1] === '~' && canOpen(input, i + 1, '~')) {
      const end = findClose(input, i + 2, '~~', '~');
      if (end > i + 1) {
        out.push({ type: 'del', children: parseInline(input.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }

    pushText(out, ch);
    i += 1;
  }

  return out;
}

/** Joins the lines of a paragraph; a trailing double space or backslash is a hard break. */
function parseParagraphLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, idx) => {
    const hard = /( {2,}|\\)$/.test(line);
    const text = line.replace(/( {2,}|\\)$/, '').trim();
    const parsed = parseInline(text);
    for (const node of parsed) {
      if (node.type === 'text') pushText(out, node.value);
      else out.push(node);
    }
    if (idx < lines.length - 1) {
      if (hard) out.push({ type: 'break' });
      else pushText(out, ' ');
    }
  });
  return out;
}

const FENCE = /^\s{0,3}(```+|~~~+)\s*([A-Za-z0-9+#._-]{0,20})[^`]*$/;
const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_ROW = /^\s{0,3}\|.*\|\s*$/;
const TABLE_SEP = /^\s{0,3}\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const CALLOUT = /^\*\*(note|tip|warning|important|caution)\b:?\*\*:?\s*/i;

/** Splits a table row into trimmed cells, honouring `\|` escapes. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseAlign(sep: string): Align[] {
  return splitRow(sep).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/** Parses a markdown subset into blocks. Never throws. */
export function parseMarkdown(input: string): Block[] {
  const source = (typeof input === 'string' ? input : '').slice(0, MAX_MARKDOWN_CHARS);
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines, 0);
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', children: parseParagraphLines(paragraph) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE);
    if (fence) {
      flushParagraph();
      const marker = fence[1][0];
      const lang = fence[2] || null;
      const body: string[] = [];
      i += 1;
      // An unterminated fence swallows the rest of the message rather than
      // leaking ``` into the prose — the model does this mid-stream.
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker === '`' ? '`' : '~'}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'code', lang, value: body.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    if (HR.test(line)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4,
        children: parseInline(heading[2].trim()),
      });
      continue;
    }

    if (QUOTE.test(line) && depth < 3) {
      flushParagraph();
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].match(QUOTE)![1]);
        i += 1;
        // Lazy continuation: a plain line right after a quote line belongs
        // to it, as on GitHub. A blank line or a new block ends the quote.
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !QUOTE.test(lines[i]) &&
          !BULLET.test(lines[i]) &&
          !ORDERED.test(lines[i]) &&
          !HEADING.test(lines[i]) &&
          !FENCE.test(lines[i]) &&
          !HR.test(lines[i])
        ) {
          inner.push(lines[i]);
          i += 1;
        }
      }
      i -= 1;
      let kind: CalloutKind | null = null;
      const first = inner.findIndex((l) => l.trim() !== '');
      if (first >= 0) {
        const m = inner[first].trim().match(CALLOUT);
        if (m) {
          const word = m[1].toLowerCase();
          kind = word === 'tip' ? 'tip' : word === 'note' || word === 'important' ? 'note' : 'warning';
          inner[first] = inner[first].trim().slice(m[0].length);
        }
      }
      blocks.push({ type: 'quote', kind, children: parseBlocks(inner, depth + 1) });
      continue;
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushParagraph();
      const header = splitRow(line).map((c) => parseInline(c));
      const align = parseAlign(lines[i + 1]);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        const cells = splitRow(lines[i]).map((c) => parseInline(c));
        // Ragged rows are padded or trimmed to the header width, as GitHub does.
        while (cells.length < header.length) cells.push([]);
        rows.push(cells.slice(0, header.length));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', align, header, rows });
      continue;
    }

    const ordered = line.match(ORDERED);
    const bullet = ordered ? null : line.match(BULLET);
    if (ordered || bullet) {
      flushParagraph();
      const baseIndent = (ordered ? ordered[1] : bullet![1]).length;
      const list: ListBlock = { type: 'list', ordered: Boolean(ordered), items: [] };
      if (ordered) {
        const start = parseInt(ordered[2], 10);
        if (start !== 1) list.start = start;
      }
      // Collect the whole list, then split items by indentation. One level
      // of nesting is enough for an answer; deeper indents fold into level 1.
      const lastItem = () => {
        const parent = list.items[list.items.length - 1];
        return parent?.sublist?.items[parent.sublist.items.length - 1] ?? parent;
      };
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '') {
          // A blank line ends the list unless the list plainly continues:
          // another item at this level, or an indented line (a code block
          // or paragraph under the current step). Models write "loose"
          // numbered procedures that way, and cutting the list there
          // restarts the numbering at 1 for every step.
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          const peek = lines[j];
          if (peek === undefined) break;
          const po = peek.match(ORDERED);
          const pb = po ? null : peek.match(BULLET);
          const continues =
            (po || pb) && (po ? po[1] : pb![1]).length <= baseIndent
              ? Boolean(po) === list.ordered && (po ? po[1] : pb![1]).length === baseIndent
              : /^\s{2,}\S/.test(peek);
          if (!continues) break;
          i = j;
          continue;
        }
        const o = l.match(ORDERED);
        const b = o ? null : l.match(BULLET);
        if (o || b) {
          const indent = (o ? o[1] : b![1]).length;
          const text = (o ? o[3] : b![2]).trim();
          if (indent <= baseIndent) {
            // A list of the other kind at the same level starts a new block.
            if (Boolean(o) !== list.ordered && indent === baseIndent) break;
            list.items.push(makeItem(text));
          } else {
            const parent = list.items[list.items.length - 1];
            if (!parent) {
              list.items.push(makeItem(text));
            } else {
              if (!parent.sublist) parent.sublist = { type: 'list', ordered: Boolean(o), items: [] };
              parent.sublist.items.push(makeItem(text));
            }
          }
          i += 1;
          continue;
        }
        // An indented fence under an item is that item's code block.
        const fenceInItem = /^\s{2,}/.test(l) ? l.match(FENCE) : null;
        if (fenceInItem && list.items.length) {
          const marker = fenceInItem[1][0];
          const close = new RegExp(`^\\s*${marker === '`' ? '`' : '~'}{3,}\\s*$`);
          const indentWidth = (l.match(/^\s*/)?.[0].length ?? 0);
          const body: string[] = [];
          i += 1;
          while (i < lines.length && !close.test(lines[i])) {
            // Strip the item's indentation, but never more than exists.
            const lead = lines[i].match(/^\s*/)?.[0].length ?? 0;
            body.push(lines[i].slice(Math.min(lead, indentWidth)));
            i += 1;
          }
          i += 1; // past the closing fence
          const target = lastItem();
          (target.blocks ??= []).push({ type: 'code', lang: fenceInItem[2] || null, value: body.join('\n') });
          continue;
        }
        // A continuation line indented under the item extends its text.
        if (l.trim() !== '' && /^\s{2,}/.test(l) && list.items.length) {
          const target = lastItem();
          if (target.blocks?.length) {
            // Text after a code block is a new paragraph inside the item.
            const last = target.blocks[target.blocks.length - 1];
            if (last.type === 'paragraph') {
              pushText(last.children, ' ');
              for (const node of parseInline(l.trim())) {
                if (node.type === 'text') pushText(last.children, node.value);
                else last.children.push(node);
              }
            } else {
              target.blocks.push({ type: 'paragraph', children: parseInline(l.trim()) });
            }
          } else {
            const extra = parseInline(l.trim());
            pushText(target.children, ' ');
            for (const node of extra) {
              if (node.type === 'text') pushText(target.children, node.value);
              else target.children.push(node);
            }
          }
          i += 1;
          continue;
        }
        break;
      }
      i -= 1;
      blocks.push(list);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

function makeItem(text: string): ListItem {
  const task = text.match(TASK);
  if (task) {
    return { children: parseInline(task[2]), checked: task[1] !== ' ' };
  }
  return { children: parseInline(text) };
}

/** Concatenated plain text of an inline run, for titles and search. */
export function inlineToText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
        case 'code':
          return n.value;
        case 'break':
          return ' ';
        default:
          return inlineToText(n.children);
      }
    })
    .join('');
}

/**
 * The first heading of a document, for use as an article title. Falls back
 * to null so the caller can decide whether to show anything at all.
 */
export function firstHeading(blocks: Block[]): string | null {
  const h = blocks.find((b): b is Extract<Block, { type: 'heading' }> => b.type === 'heading');
  return h ? inlineToText(h.children).trim() || null : null;
}
