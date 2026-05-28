import { Fragment } from 'react'
import { useApp } from '../AppContext'
import WikiLink from './WikiLink'
import WikiImage from './WikiImage'
import { LETTER_COLLECTION } from './wikiHelpers'

// Re-export so consumers (pages, Dashboard) can still import from WikiText
export { COLLECTION_LETTER, LETTER_COLLECTION, findEntity } from './wikiHelpers'

// ─── Inline regex — order matters ────────────────────────────────────────────
// Priority: image > valid wikilink > invalid wikilink > bold-italic > bold > italic
const INLINE_RE = new RegExp(
  '(' +
  [
    '\\[\\[https?:\\/\\/[^\\]]*\\]\\]',   // [[https://...]] image
    '\\[\\[\\{\\d+[A-Z]\\}[^\\]]*\\]\\]', // [[{NL}text]] valid wikilink
    '\\[\\[\\{\\d+\\}[^\\]]*\\]\\]',      // [[{N}text]] invalid wikilink
    '\\*\\*\\*[^*]+\\*\\*\\*',            // ***bold-italic***
    '\\*\\*[^*]+\\*\\*',                  // **bold**
    '\\*[^*]+\\*',                        // *italic*
  ].join('|') +
  ')',
  'g'
)

/**
 * Parses inline text into typed nodes.
 * @param {string} text
 * @returns {{ type: string, [key: string]: any }[]}
 */
function parseInline(text) {
  const nodes = []
  let lastIndex = 0

  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const seg = match[0]
    lastIndex = match.index + seg.length

    // Image: [[https://...]] or [[http://...]]
    const imgMatch = seg.match(/^\[\[(https?:\/\/[^\]]*)\]\]$/)
    if (imgMatch) { nodes.push({ type: 'image', url: imgMatch[1] }); continue }

    // Valid wiki-link: [[{NL}text]]
    const wlValid = seg.match(/^\[\[\{(\d+)([A-Z])\}([^\]]*)\]\]$/)
    if (wlValid) {
      nodes.push({ type: 'wikilink', id: parseInt(wlValid[1], 10), letter: wlValid[2], displayText: wlValid[3] })
      continue
    }

    // Invalid wiki-link: [[{N}text]] (number without letter)
    if (/^\[\[\{\d+\}/.test(seg)) {
      const parts = seg.match(/^\[\[\{\d+\}([^\]]*)\]\]$/)
      nodes.push({ type: 'wikilink-invalid', displayText: parts?.[1] ?? '' })
      continue
    }

    // Bold + italic: ***text***
    if (seg.startsWith('***')) { nodes.push({ type: 'bold-italic', text: seg.slice(3, -3) }); continue }

    // Bold: **text**
    if (seg.startsWith('**')) { nodes.push({ type: 'bold', text: seg.slice(2, -2) }); continue }

    // Italic: *text*
    if (seg.startsWith('*')) { nodes.push({ type: 'italic', text: seg.slice(1, -1) }); continue }

    nodes.push({ type: 'text', text: seg })
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return nodes
}

/**
 * Splits text into block-level elements.
 * @param {string} text
 * @returns {{ type: string, content?: string, lines?: string[], items?: string[] }[]}
 */
function parseBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headings (check ### before ## before #)
    if (line.startsWith('### ')) { blocks.push({ type: 'h3', content: line.slice(4) }); i++; continue }
    if (line.startsWith('## ')) { blocks.push({ type: 'h2', content: line.slice(3) }); i++; continue }
    if (line.startsWith('# ')) { blocks.push({ type: 'h1', content: line.slice(2) }); i++; continue }

    // Horizontal rule
    if (line.trim() === '---') { blocks.push({ type: 'hr' }); i++; continue }

    // Unordered list — consume consecutive `- ` or `* ` lines
    if (/^[-*] /.test(line)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    // Ordered list — consume consecutive `N. ` lines
    if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Empty line — paragraph separator, skip
    if (line.trim() === '') { i++; continue }

    // Paragraph — consume consecutive non-special lines
    const paragraphLines = []
    while (i < lines.length) {
      const l = lines[i]
      if (!l.trim()) break
      if (/^#{1,3} /.test(l) || l.trim() === '---' || /^[-*] /.test(l) || /^\d+\. /.test(l)) break
      paragraphLines.push(l)
      i++
    }
    if (paragraphLines.length) blocks.push({ type: 'p', lines: paragraphLines })
  }

  return blocks
}

function renderInlineNodes(inlineText, keyPrefix, db, goToDetail) {
  return parseInline(inlineText).map((node, j) => {
    const key = `${keyPrefix}-${j}`

    if (node.type === 'image') {
      return <WikiImage key={key} url={node.url} />
    }

    if (node.type === 'wikilink') {
      const coll = LETTER_COLLECTION[node.letter]
      const entity = coll ? (db[coll] || []).find(e => e.id === node.id) : null
      if (entity) {
        return (
          <WikiLink
            key={key}
            id={node.id}
            letter={node.letter}
            displayText={node.displayText}
            entity={entity}
            page={coll}
            goToDetail={goToDetail}
          />
        )
      }
      return (
        <span
          key={key}
          className="text-txt-muted border-b border-dashed border-txt-muted opacity-55 cursor-default"
          title={`Artículo #${node.id} no encontrado`}
        >
          {node.displayText}
        </span>
      )
    }

    if (node.type === 'wikilink-invalid') {
      return (
        <span
          key={key}
          className="font-mono text-[11px] text-txt-muted opacity-40 cursor-default"
          title="Formato de wiki-link inválido: falta la letra de sección"
        >
          {node.displayText || '[[ID incorrecto]]'}
        </span>
      )
    }

    if (node.type === 'bold-italic') return <strong key={key}><em>{node.text}</em></strong>
    if (node.type === 'bold') return <strong key={key}>{node.text}</strong>
    if (node.type === 'italic') return <em key={key}>{node.text}</em>

    return <span key={key}>{node.text}</span>
  })
}

/**
 * Renders text with markdown and wiki-link support.
 * Supported markdown: # ## ### headings, - * unordered lists, 1. ordered lists,
 * --- horizontal rule, **bold**, *italic*, ***bold-italic***, [[url]] images.
 * Wiki-link syntax: [[{NL}Display text]]
 */
export default function WikiText({ text }) {
  const { db, goToDetail } = useApp()
  if (!text) return null

  return (
    <>
      {parseBlocks(text).map((block, i) => {
        if (block.type === 'hr') {
          return <hr key={i} className="my-3 border-border-base" />
        }
        if (block.type === 'h1') {
          return <h1 key={i} className="font-exo text-xl font-bold text-accent-dim mt-4 mb-2">{renderInlineNodes(block.content, `${i}`, db, goToDetail)}</h1>
        }
        if (block.type === 'h2') {
          return <h2 key={i} className="font-exo text-lg font-semibold text-txt-primary mt-3 mb-1.5 border-b border-accent-dim">{renderInlineNodes(block.content, `${i}`, db, goToDetail)}</h2>
        }
        if (block.type === 'h3') {
          return <h3 key={i} className="font-exo text-base font-semibold text-txt-primary mt-2 mb-1">{renderInlineNodes(block.content, `${i}`, db, goToDetail)}</h3>
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc list-inside my-1.5 space-y-0.5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInlineNodes(item, `${i}-${j}`, db, goToDetail)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal list-inside my-1.5 space-y-0.5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInlineNodes(item, `${i}-${j}`, db, goToDetail)}</li>
              ))}
            </ol>
          )
        }
        // Paragraph
        return (
          <p key={i} className="mb-2 last:mb-0">
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {renderInlineNodes(line, `${i}-${j}`, db, goToDetail)}
                {j < block.lines.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
