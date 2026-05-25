# Markdown + WikiImage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add basic markdown rendering and `[[url]]` image embeds to `WikiText`, preserving all existing wiki-link functionality.

**Architecture:** Two-pass pipeline inside `WikiText.jsx` — `parseBlocks()` splits text into block-level elements (headings, lists, hr, paragraphs), then `parseInline()` processes each block's text into inline nodes (bold, italic, wiki-links, images). A new `WikiImage.jsx` handles image display with error fallback.

**Tech Stack:** React 18, Vite, Tailwind CSS. No new dependencies.

> **Note:** This project has no test runner configured (`npm test` is not available). TDD steps are replaced with manual browser verification using `npm run dev`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/WikiImage.jsx` | Create | Image embed with error fallback |
| `src/components/WikiText.jsx` | Modify | Block + inline markdown pipeline |

---

### Task 1: Create `WikiImage` component

**Files:**
- Create: `src/components/WikiImage.jsx`

- [ ] **Step 1: Create the file**

`src/components/WikiImage.jsx`:

```jsx
import { useState } from 'react'

export default function WikiImage({ url }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-bright underline"
      >
        [Error al cargar imagen]
      </a>
    )
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setError(true)}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
    />
  )
}
```

- [ ] **Step 2: Verify the file saved correctly**

Run: `cat src/components/WikiImage.jsx`
Expected: file content as above, no syntax errors visible.

---

### Task 2: Rewrite `WikiText.jsx` with block + inline pipeline

**Files:**
- Modify: `src/components/WikiText.jsx`

- [ ] **Step 1: Replace the entire file content**

`src/components/WikiText.jsx`:

```jsx
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

  for (const match of text.matchAll(new RegExp(INLINE_RE.source, 'g'))) {
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
    if (/^\[\[\{\d+\}/.test(seg)) { nodes.push({ type: 'wikilink-invalid' }); continue }

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
    if (line.startsWith('## '))  { blocks.push({ type: 'h2', content: line.slice(3) }); i++; continue }
    if (line.startsWith('# '))   { blocks.push({ type: 'h1', content: line.slice(2) }); i++; continue }

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

/**
 * Renders text with markdown and wiki-link support.
 * Supported markdown: # ## ### headings, - * unordered lists, 1. ordered lists,
 * --- horizontal rule, **bold**, *italic*, ***bold-italic***, [[url]] images.
 * Wiki-link syntax: [[{NL}Display text]]
 */
export default function WikiText({ text }) {
  const { db, goToDetail } = useApp()
  if (!text) return null

  function renderInlineNodes(inlineText, keyPrefix) {
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
            [[ID incorrecto]]
          </span>
        )
      }

      if (node.type === 'bold-italic') return <strong key={key}><em>{node.text}</em></strong>
      if (node.type === 'bold')        return <strong key={key}>{node.text}</strong>
      if (node.type === 'italic')      return <em key={key}>{node.text}</em>

      // Plain text — preserve line breaks within the node
      return node.text.split('\n').map((line, k, arr) => (
        <span key={`${key}-${k}`}>{line}{k < arr.length - 1 ? <br /> : null}</span>
      ))
    })
  }

  return (
    <>
      {parseBlocks(text).map((block, i) => {
        if (block.type === 'hr') {
          return <hr key={i} className="my-3 border-border-base" />
        }
        if (block.type === 'h1') {
          return <h1 key={i} className="font-exo text-xl font-bold text-txt-primary mt-4 mb-2">{renderInlineNodes(block.content, `${i}`)}</h1>
        }
        if (block.type === 'h2') {
          return <h2 key={i} className="font-exo text-lg font-semibold text-txt-primary mt-3 mb-1.5">{renderInlineNodes(block.content, `${i}`)}</h2>
        }
        if (block.type === 'h3') {
          return <h3 key={i} className="font-exo text-base font-semibold text-txt-secondary mt-2 mb-1">{renderInlineNodes(block.content, `${i}`)}</h3>
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc list-inside my-1.5 space-y-0.5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInlineNodes(item, `${i}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal list-inside my-1.5 space-y-0.5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInlineNodes(item, `${i}-${j}`)}</li>
              ))}
            </ol>
          )
        }
        // Paragraph
        return (
          <p key={i} className="mb-2 last:mb-0">
            {block.lines.map((line, j) => (
              <span key={j}>
                {renderInlineNodes(line, `${i}-${j}`)}
                {j < block.lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Start the dev server and verify visually**

Run: `npm run dev`

Open the app in the browser. Navigate to any entity detail (e.g. a Lore entry). Verify:
- Existing plain text still renders correctly (no regressions)
- Existing wiki-links `[[{NL}texto]]` still work (click navigates, tooltip appears)
- Existing invalid wiki-links show `[[ID incorrecto]]` as before

- [ ] **Step 3: Test markdown rendering**

In the DM form for any entity (Lore, PNJ, etc.), edit a description field and enter:

```
# Título grande

## Subtítulo

Párrafo normal con **negrita** y *cursiva* y ***ambos***.

- Item uno
- Item dos
- Item tres

1. Primero
2. Segundo

---

Después del separador.
```

Save and open the detail view. Verify:
- `# Título grande` renders as a large bold heading
- `## Subtítulo` renders as a smaller heading
- `**negrita**` renders as bold text
- `*cursiva*` renders as italic text
- `***ambos***` renders as bold+italic
- List items render as a bullet list
- Numbered list renders as an ordered list
- `---` renders as a horizontal line
- Paragraphs separated by blank line are visually separated

- [ ] **Step 4: Test image embed**

Edit a description field and enter:

```
Texto antes.

[[https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png]]

Texto después.
```

Save and open the detail view. Verify:
- Image renders contained within the available width
- Image is centered
- Aspect ratio is preserved

- [ ] **Step 5: Test image error fallback**

Edit a description field and enter:

```
[[https://this-url-does-not-exist.invalid/image.jpg]]
```

Save and open the detail view. Verify:
- Text `[Error al cargar imagen]` appears as a clickable link
- Link points to the URL and opens in a new tab

- [ ] **Step 6: Test wiki-link + markdown combination**

Edit a description field and enter:

```
**El [[{1L}primer artículo de lore]]** es importante.
```

(Use a valid wiki-link ID and letter for an existing entity in your DB.)

Save and open the detail view. Verify:
- The wiki-link text renders in bold
- Clicking the link navigates to the entity
- Tooltip still appears on hover
