'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline, type ListBlock } from '@/lib/markdown-lite';

/**
 * Renders the markdown subset parsed by lib/markdown-lite.ts.
 *
 * Every node becomes a React element. There is no dangerouslySetInnerHTML in
 * this file, and there must never be one: `next.config.ts` allows inline
 * scripts, so injected markup would execute. React escapes text children,
 * and the parser has already refused any href that is not https or
 * site-relative.
 *
 * Two densities. `article` is the Kairi page: reading measure, generous
 * rhythm, real headings, copyable code. `compact` is the floating widget,
 * where the same nodes render tighter. Both use the same parser and the
 * same element allowlist.
 */

export type MarkdownDensity = 'article' | 'compact';

function renderInline(nodes: Inline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'break':
        return <br key={key} />;
      case 'strong':
        return (
          <strong key={key}>{renderInline(node.children, key)}</strong>
        );
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'del':
        return (
          <del key={key} className="text-ink-soft">
            {renderInline(node.children, key)}
          </del>
        );
      case 'code':
        return (
          <code
            key={key}
            className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[0.88em] text-ink-strong [overflow-wrap:anywhere]"
          >
            {node.value}
          </code>
        );
      case 'link':
        return (
          <span key={key}>
            <a
              href={node.href}
              className="font-[500] text-brand-600 underline decoration-brand-300 underline-offset-[3px] transition-colors hover:decoration-brand-600"
              {...(node.external ? { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } : {})}
            >
              {renderInline(node.children, key)}
            </a>
            {/* The link text is chosen by whoever wrote the content — which
                may be a stranger's issue title or a repository README. The
                host is not. Showing it defeats most link-based social
                engineering and costs one muted span. Skipped when the text
                already is the URL. */}
            {node.external && node.host && !isBareUrl(node) && (
              <span className="text-[0.8em] text-ink-soft"> ({node.host})</span>
            )}
          </span>
        );
    }
  });
}

function isBareUrl(node: Extract<Inline, { type: 'link' }>): boolean {
  const only = node.children.length === 1 ? node.children[0] : null;
  return Boolean(only && only.type === 'text' && only.value.startsWith('https://'));
}

/** Copy button + language chip on fenced code. */
function CodeBlock({ lang, value, density }: { lang: string | null; value: string; density: MarkdownDensity }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable over plain http on some phones; the text
      // is still selectable, so there is nothing else useful to do.
    }
  };
  const label = lang ? lang.toLowerCase() : 'code';
  return (
    <div
      className={
        'group/code relative overflow-hidden rounded-xl border border-line bg-panel ' +
        (density === 'article' ? 'my-4' : 'my-2')
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md px-2 py-0.5 text-[11.5px] font-[500] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink"
          aria-live="polite"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className={
          'overflow-x-auto px-3.5 py-3 leading-relaxed ' +
          (density === 'article' ? 'text-[13px]' : 'text-[12.5px]')
        }
      >
        <code className="font-mono">{value}</code>
      </pre>
    </div>
  );
}

function renderList(block: ListBlock, key: string, density: MarkdownDensity, nested = false): ReactNode {
  const items = block.items.map((item, i) => {
    const itemKey = `${key}-li-${i}`;
    const isTask = typeof item.checked === 'boolean';
    return (
      <li key={itemKey} className={'my-1 ' + (isTask ? 'list-none -ml-5 flex gap-2' : '')}>
        {isTask && (
          <span
            aria-hidden="true"
            className={
              'mt-[0.32em] inline-flex h-[1em] w-[1em] shrink-0 items-center justify-center rounded-[4px] border text-[0.7em] ' +
              (item.checked
                ? 'border-success-500 bg-success-500 text-white'
                : 'border-line-heavy bg-ground')
            }
          >
            {item.checked ? '✓' : ''}
          </span>
        )}
        <span className={isTask && item.checked ? 'text-ink-soft line-through decoration-line-heavy' : ''}>
          {renderInline(item.children, itemKey)}
          {item.blocks?.map((b, j) => renderBlock(b, `${itemKey}-b${j}`, density))}
          {item.sublist && renderList(item.sublist, `${itemKey}-sub`, density, true)}
          {isTask && <span className="sr-only">{item.checked ? ' (done)' : ' (to do)'}</span>}
        </span>
      </li>
    );
  });
  const spacing = nested ? 'mt-1 mb-0' : density === 'article' ? 'my-3' : 'my-2';
  const cls = `${spacing} ml-5 space-y-0.5 ` + (block.ordered ? 'list-decimal marker:font-[500] marker:text-ink-soft' : 'list-disc marker:text-ink-faint');
  return block.ordered ? (
    <ol key={key} className={cls} start={block.start}>
      {items}
    </ol>
  ) : (
    <ul key={key} className={cls}>
      {items}
    </ul>
  );
}

const CALLOUT_STYLES = {
  note: { label: 'Note', box: 'border-brand-200 bg-brand-0', text: 'text-brand-700' },
  tip: { label: 'Tip', box: 'border-success-200 bg-success-0', text: 'text-success-700' },
  warning: { label: 'Warning', box: 'border-warning-200 bg-warning-0', text: 'text-warning-800' },
} as const;

function renderBlock(block: Block, key: string, density: MarkdownDensity): ReactNode {
  const article = density === 'article';
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={key} className={(article ? 'my-3.5 ' : 'my-2 ') + 'first:mt-0 last:mb-0 leading-[1.7]'}>
          {renderInline(block.children, key)}
        </p>
      );
    case 'heading': {
      // `#` and `##` both become h2: the answer card supplies the h1-level
      // title, and a model that opens with `#` should not out-rank it.
      const level = Math.min(4, Math.max(2, block.level));
      const Tag = (['h2', 'h3', 'h4'] as const)[level - 2];
      const size = article
        ? Tag === 'h2'
          ? 'mt-8 mb-3 text-[19px] font-[620] tracking-[-0.01em]'
          : Tag === 'h3'
            ? 'mt-6 mb-2 text-[16px] font-[600]'
            : 'mt-4 mb-1.5 text-[14.5px] font-[600] uppercase tracking-wide text-ink-mid'
        : 'mt-3 mb-1 text-[14px] font-[600]';
      return (
        <Tag key={key} className={`${size} first:mt-0 leading-snug text-ink`}>
          {renderInline(block.children, key)}
        </Tag>
      );
    }
    case 'code':
      return <CodeBlock key={key} lang={block.lang} value={block.value} density={density} />;
    case 'list':
      return renderList(block, key, density);
    case 'hr':
      return <hr key={key} className={(article ? 'my-6' : 'my-3') + ' border-0 border-t border-line'} />;
    case 'quote': {
      const style = block.kind ? CALLOUT_STYLES[block.kind] : null;
      if (style) {
        return (
          <aside
            key={key}
            className={`${article ? 'my-4' : 'my-2'} rounded-xl border px-4 py-3 ${style.box}`}
            role="note"
          >
            <p className={`mb-1 text-[11.5px] font-[650] uppercase tracking-wider ${style.text}`}>{style.label}</p>
            <div className="text-[0.96em] [&>p]:my-1 [&>p]:leading-relaxed">
              {block.children.map((b, i) => renderBlock(b, `${key}-q${i}`, density))}
            </div>
          </aside>
        );
      }
      return (
        <blockquote
          key={key}
          className={`${article ? 'my-4' : 'my-2'} border-l-[3px] border-line-heavy pl-4 text-ink-mid [&>p]:my-1`}
        >
          {block.children.map((b, i) => renderBlock(b, `${key}-q${i}`, density))}
        </blockquote>
      );
    }
    case 'table': {
      const alignClass = (a: (typeof block.align)[number]) =>
        a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
      return (
        <div key={key} className={(article ? 'my-4' : 'my-2') + ' overflow-x-auto rounded-xl border border-line'}>
          <table className="w-full border-collapse text-[0.94em]">
            <thead className="bg-panel">
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={`${key}-th-${i}`}
                    scope="col"
                    className={`border-b border-line px-3 py-2 font-[600] text-ink ${alignClass(block.align[i] ?? null)}`}
                  >
                    {renderInline(cell, `${key}-th-${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={`${key}-tr-${r}`} className="border-b border-line last:border-b-0">
                  {row.map((cell, c) => (
                    <td
                      key={`${key}-td-${r}-${c}`}
                      className={`px-3 py-2 align-top leading-relaxed ${alignClass(block.align[c] ?? null)}`}
                    >
                      {renderInline(cell, `${key}-td-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

export function MarkdownLite({
  text,
  className,
  density = 'compact',
}: {
  text: string;
  className?: string;
  density?: MarkdownDensity;
}) {
  const blocks = parseMarkdown(text);
  return <div className={className}>{blocks.map((b, i) => renderBlock(b, `b${i}`, density))}</div>;
}
