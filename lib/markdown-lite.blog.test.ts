/**
 * The GitHub-flavoured additions that make model output read like a post:
 * tables, callouts, task and nested lists, code under a numbered step,
 * rules, strikethrough, bare-URL autolinks and escapes. The security
 * properties of links are covered in markdown-lite.test.ts; this file is
 * about shape.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { firstHeading, inlineToText, parseInline, parseMarkdown, type Block } from './markdown-lite';
import { MarkdownLite } from '@/app/components/MarkdownLite';

const html = (text: string) => renderToStaticMarkup(createElement(MarkdownLite, { text, density: 'article' }));

describe('tables', () => {
  it('parses a header, alignment row and body', () => {
    const [table] = parseMarkdown('| Tool | Cost |\n|:-----|-----:|\n| a | 1 |\n| b | 2 |');
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.align).toEqual(['left', 'right']);
    expect(table.header.map(inlineToText)).toEqual(['Tool', 'Cost']);
    expect(table.rows.map((r) => r.map(inlineToText))).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('pads ragged rows to the header width and honours escaped pipes', () => {
    const [table] = parseMarkdown('| a | b | c |\n|---|---|---|\n| x \\| y | z |');
    if (table.type !== 'table') throw new Error('not a table');
    expect(table.rows[0].map(inlineToText)).toEqual(['x | y', 'z', '']);
  });

  it('leaves a lone pipe line as a paragraph', () => {
    const blocks = parseMarkdown('| not | a table |');
    expect(blocks[0].type).toBe('paragraph');
  });

  it('renders as a real table with scoped headers', () => {
    const out = html('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(out).toContain('<table');
    expect(out).toContain('scope="col"');
    expect(out).toContain('<td');
  });
});

describe('blockquotes and callouts', () => {
  it('turns a **Tip:** quote into a tip callout with the label stripped', () => {
    const [quote] = parseMarkdown('> **Tip:** read the README first');
    expect(quote).toMatchObject({ type: 'quote', kind: 'tip' });
    if (quote.type !== 'quote') return;
    expect(quote.children[0].type).toBe('paragraph');
    expect(inlineToText((quote.children[0] as Extract<Block, { type: 'paragraph' }>).children)).toBe('read the README first');
  });

  it.each([
    ['> **Note:** x', 'note'],
    ['> **Important:** x', 'note'],
    ['> **Warning:** x', 'warning'],
    ['> **Caution** x', 'warning'],
    ['> **warning**: x', 'warning'],
  ])('classifies %s as %s', (input, kind) => {
    expect(parseMarkdown(input)[0]).toMatchObject({ type: 'quote', kind });
  });

  it('keeps an ordinary quote as a plain quote, with lazy continuation', () => {
    const [quote] = parseMarkdown('> first line\nstill the quote\n\nnot the quote');
    expect(quote).toMatchObject({ type: 'quote', kind: null });
    if (quote.type !== 'quote') return;
    expect(inlineToText((quote.children[0] as Extract<Block, { type: 'paragraph' }>).children)).toBe(
      'first line still the quote',
    );
    expect(parseMarkdown('> first line\nstill the quote\n\nnot the quote')).toHaveLength(2);
  });

  it('renders callouts as an aside with a visible label', () => {
    const out = html('> **Warning:** careful');
    expect(out).toContain('<aside');
    expect(out).toContain('Warning');
    expect(out).toContain('careful');
  });
});

describe('lists', () => {
  it('parses task items with their checked state', () => {
    const [list] = parseMarkdown('- [ ] fork it\n- [x] star it');
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.items.map((i) => i.checked)).toEqual([false, true]);
    expect(list.items.map((i) => inlineToText(i.children))).toEqual(['fork it', 'star it']);
  });

  it('nests an indented list one level under its parent item', () => {
    const [list] = parseMarkdown('1. outer\n   - inner a\n   - inner b\n2. next');
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.items).toHaveLength(2);
    expect(list.items[0].sublist?.ordered).toBe(false);
    expect(list.items[0].sublist?.items.map((i) => inlineToText(i.children))).toEqual(['inner a', 'inner b']);
  });

  it('keeps an ordered list numbered when items are separated by blank lines', () => {
    const blocks = parseMarkdown('1. one\n\n2. two\n\n3. three');
    expect(blocks).toHaveLength(1);
    if (blocks[0].type !== 'list') throw new Error('not a list');
    expect(blocks[0].items).toHaveLength(3);
  });

  it('remembers a start number other than 1', () => {
    const [list] = parseMarkdown('3. c\n4. d');
    expect(list).toMatchObject({ type: 'list', ordered: true, start: 3 });
    expect(html('3. c\n4. d')).toContain('start="3"');
  });

  it('attaches an indented fenced block to the step above it', () => {
    const md = ['1. Clone it:', '', '   ```bash', '   git clone x', '   cd x', '   ```', '', '2. Build it.'].join('\n');
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    if (blocks[0].type !== 'list') throw new Error('not a list');
    expect(blocks[0].items).toHaveLength(2);
    expect(blocks[0].items[0].blocks).toEqual([{ type: 'code', lang: 'bash', value: 'git clone x\ncd x' }]);
    const out = html(md);
    expect(out).toContain('<pre');
    expect(out).toContain('git clone x');
  });

  it('still separates a bullet list from a following ordered list', () => {
    const blocks = parseMarkdown('- a\n1. b');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'list']);
  });
});

describe('rules, headings and inline extras', () => {
  it('parses horizontal rules but not list-looking dashes', () => {
    expect(parseMarkdown('---')[0].type).toBe('hr');
    expect(parseMarkdown('* * *')[0].type).toBe('hr');
    expect(parseMarkdown('- item')[0].type).toBe('list');
  });

  it('accepts four heading levels and strips closing hashes', () => {
    expect(parseMarkdown('#### Deep ##')[0]).toMatchObject({ type: 'heading', level: 4 });
    expect(inlineToText((parseMarkdown('## Title ##')[0] as Extract<Block, { type: 'heading' }>).children)).toBe('Title');
  });

  it('parses strikethrough and underscore emphasis but not snake_case', () => {
    expect(parseInline('~~old~~')).toEqual([{ type: 'del', children: [{ type: 'text', value: 'old' }] }]);
    expect(parseInline('__b__ and _i_')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' and ' },
      { type: 'em', children: [{ type: 'text', value: 'i' }] },
    ]);
    expect(parseInline('run npm_run_build now')).toEqual([{ type: 'text', value: 'run npm_run_build now' }]);
  });

  it('autolinks a bare https URL and trims sentence punctuation', () => {
    const nodes = parseInline('see https://github.com/x/y.');
    expect(nodes).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'link',
        href: 'https://github.com/x/y',
        external: true,
        host: 'github.com',
        children: [{ type: 'text', value: 'https://github.com/x/y' }],
      },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not autolink http:// or an https URL inside a code span', () => {
    expect(parseInline('http://insecure.example/x').every((n) => n.type === 'text')).toBe(true);
    expect(parseInline('`https://x.dev`')).toEqual([{ type: 'code', value: 'https://x.dev' }]);
  });

  it('balances a closing paren the sentence added', () => {
    const nodes = parseInline('(docs: https://x.dev/a_(b))');
    const link = nodes.find((n) => n.type === 'link');
    expect(link).toMatchObject({ href: 'https://x.dev/a_(b)' });
  });

  it('honours backslash escapes and double-backtick spans', () => {
    expect(parseInline('\\*not em\\*')).toEqual([{ type: 'text', value: '*not em*' }]);
    expect(parseInline('`` a`b ``')).toEqual([{ type: 'code', value: 'a`b' }]);
  });

  it('drops a link title and keeps the URL', () => {
    expect(parseInline('[x](https://a.dev "Title")')[0]).toMatchObject({ type: 'link', href: 'https://a.dev/' });
  });

  it('turns a trailing double space into a hard break', () => {
    const [p] = parseMarkdown('line one  \nline two');
    if (p.type !== 'paragraph') throw new Error('not a paragraph');
    expect(p.children.some((n) => n.type === 'break')).toBe(true);
  });

  it('accepts ~~~ fences and language tags', () => {
    expect(parseMarkdown('~~~ts\nconst a = 1;\n~~~')[0]).toEqual({ type: 'code', lang: 'ts', value: 'const a = 1;' });
  });
});

describe('helpers', () => {
  it('firstHeading returns the first heading text or null', () => {
    expect(firstHeading(parseMarkdown('intro\n\n## Setup\n\ntext'))).toBe('Setup');
    expect(firstHeading(parseMarkdown('just a paragraph'))).toBeNull();
  });

  it('renders a code block with a language chip and copy button', () => {
    const out = html('```bash\nnpm test\n```');
    expect(out).toContain('bash');
    expect(out).toContain('Copy');
    expect(out).toContain('npm test');
  });

  it('never emits raw HTML from the input', () => {
    const out = html('<img src=x onerror=alert(1)>\n\n| <b>x</b> |\n|---|\n| <script>1</script> |');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;img');
  });
});
