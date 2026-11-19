import type { ReactNode } from 'react';

function renderLessonInline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-emerald-800">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

export function FormattedAiText({ content }: { content: string }) {
  const normalized = content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\\"/g, '"');
  const lines = normalized.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`} className="my-3 overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100"><code>{codeLines.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const title = heading[2].replace(/\s*#+$/, '').trim();
      const Tag = heading[1].length === 1 ? 'h3' : 'h4';
      blocks.push(<Tag key={`heading-${index}`} className="mb-2 mt-5 first:mt-0 font-display text-base font-bold text-slate-900">{renderLessonInline(title)}</Tag>);
      index += 1;
      continue;
    }

    const isOrdered = /^\d+[.)]\s+/.test(line);
    const isUnordered = /^[-*•]\s+/.test(line);
    if (isOrdered || isUnordered) {
      const items = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const match = isOrdered ? itemLine.match(/^\d+[.)]\s+(.+)$/) : itemLine.match(/^[-*•]\s+(.+)$/);
        if (!match) break;
        items.push(<li key={index}>{renderLessonInline(match[1])}</li>);
        index += 1;
      }
      const List = isOrdered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`} className={`my-2 space-y-1.5 pl-6 text-slate-700 ${isOrdered ? 'list-decimal' : 'list-disc'}`}>{items}</List>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || next.startsWith('```') || /^(#{1,3})\s+/.test(next) || /^\d+[.)]\s+/.test(next) || /^[-*•]\s+/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className="my-2 leading-7 text-slate-700">{renderLessonInline(paragraph.join(' '))}</p>);
  }

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}
