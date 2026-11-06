export const TOC_TYPE = 'toc'
export const DEFAULT_TOC_DATA = Object.freeze({
  title: 'Table of contents',
  minLevel: 2,
  maxLevel: 6,
  numbered: false,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeTocData(value) {
  if (!isRecord(value)) throw new TypeError('TOC data must be an object')
  const keys = ['title', 'minLevel', 'maxLevel', 'numbered']
  if (Object.keys(value).some(key => !keys.includes(key))) {
    throw new TypeError('Unknown TOC data property')
  }
  // Treat caller-owned records as data; inherited prototype properties
  // are not authored TOC settings and must never influence persisted JSON.
  const own = key => Object.hasOwn(value, key) ? value[key] : undefined
  const title = own('title') ?? DEFAULT_TOC_DATA.title
  const minLevel = own('minLevel') ?? DEFAULT_TOC_DATA.minLevel
  const maxLevel = own('maxLevel') ?? DEFAULT_TOC_DATA.maxLevel
  const numbered = own('numbered') ?? DEFAULT_TOC_DATA.numbered
  if (typeof title !== 'string') throw new TypeError('TOC title must be a string')
  if (!Number.isInteger(minLevel) || !Number.isInteger(maxLevel)
    || minLevel < 2 || maxLevel > 6 || minLevel > maxLevel) {
    throw new RangeError('TOC levels must satisfy 2 <= minLevel <= maxLevel <= 6')
  }
  if (typeof numbered !== 'boolean') throw new TypeError('TOC numbered must be boolean')
  return { title, minLevel, maxLevel, numbered }
}

export const tocSchema = Object.freeze({
  currentVersion: 1,
  createDefault() { return { ...DEFAULT_TOC_DATA } },
  decode(input) {
    if (!isRecord(input) || input.dataVersion !== 1) {
      throw new RangeError('TOC requires dataVersion 1')
    }
    return { dataVersion: 1, data: normalizeTocData(input.data) }
  },
  encode(data) { return { dataVersion: 1, data: normalizeTocData(data) } },
})

const ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®',
})

function decodeEntities(text) {
  return text.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? match
    const hex = entity[1]?.toLowerCase() === 'x'
    const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    if (!Number.isFinite(point) || point === 0 || point > 0x10ffff
      || (point >= 0xd800 && point <= 0xdfff)) return '\ufffd'
    return String.fromCodePoint(point)
  })
}

/** Plain-text extraction without inserting author HTML into a live DOM. */
function richTextToText(html, resolveInlineToken) {
  if (typeof html !== 'string') throw new TypeError('Heading text must be a string')

  let result = ''
  let rawText = ''
  let commentTerminatorExhausted = false
  const flushText = () => {
    if (!rawText) return
    if (resolveInlineToken) {
      // Resolve only raw tokens present in a single HTML text segment.
      // Decoding entities first would turn literal &#123;&#123;id&#125;&#125;
      // into a widget reference that the editor never authored.
      const tokens = /\{\{([^{}\s]+)\}\}/g
      let consumed = 0
      for (const match of rawText.matchAll(tokens)) {
        result += decodeEntities(rawText.slice(consumed, match.index))
        const replacement = resolveInlineToken(match[1], match[0])
        result += typeof replacement === 'string' ? replacement : match[0]
        consumed = match.index + match[0].length
      }
      result += decodeEntities(rawText.slice(consumed))
    } else {
      result += decodeEntities(rawText)
    }
    rawText = ''
  }

  for (let i = 0; i < html.length;) {
    if (html[i] !== '<' || !/[/!a-zA-Z]/.test(html[i + 1] ?? '')) {
      rawText += html[i++]
      continue
    }
    if (html.startsWith('<!--', i)) {
      // The first unsuccessful search proves no later terminator exists.
      // Preserve existing literal-tail semantics without rescanning it for
      // every subsequent opener (otherwise malformed input is quadratic).
      const end = commentTerminatorExhausted ? -1 : html.indexOf('-->', i + 4)
      if (end === -1) {
        commentTerminatorExhausted = true
        rawText += html[i++]
        continue
      }
      flushText()
      i = end + 3
      continue
    }
    let j = i + 1
    let quote = ''
    for (; j < html.length; j++) {
      const char = html[j]
      if (quote) { if (char === quote) quote = ''; continue }
      if (char === '"' || char === "'") quote = char
      else if (char === '>') break
    }
    if (j === html.length) { rawText += html.slice(i); break }
    flushText()
    const tag = html.slice(i + 1, j).trim().toLowerCase()
    if (/^\/?(?:br|p|div|li)(?:\s|\/|$)/.test(tag)) result += ' '
    i = j + 1
  }
  flushText()
  return result.replace(/\s+/g, ' ').trim()
}

/** Extract heading text without parsing author HTML into live DOM. */
export function htmlToText(html) {
  return richTextToText(html)
}

/** Pure document-to-headings projection; does not read DOM or make requests. */
export function collectTocHeadings(documentData, { inlineToText, textFromBlock } = {}) {
  if (!isRecord(documentData) || !Array.isArray(documentData.blocks)) {
    throw new TypeError('TOC source requires a document with blocks')
  }
  const headings = []
  for (const block of documentData.blocks) {
    if (block?.type !== 'heading') continue
    const level = block.data?.level
    if (!Number.isInteger(level) || level < 2 || level > 6
      || typeof block.id !== 'string' || !block.id
      || typeof block.data?.text !== 'string') continue
    const resolveInlineToken = inlineToText && !textFromBlock
      ? (id, token) => Object.hasOwn(block.inline ?? {}, id)
        ? inlineToText(block.inline[id], block) ?? token
        : token
      : undefined
    let text = textFromBlock
      ? textFromBlock(block)
      : richTextToText(block.data.text, resolveInlineToken)
    if (typeof text !== 'string') throw new TypeError('textFromBlock must return a string')
    text = text.replace(/\s+/g, ' ').trim()
    if (text) headings.push(Object.freeze({ id: block.id, level, text }))
  }
  return Object.freeze(headings)
}

/** Support heading-level skips without inventing missing ancestors. */
export function buildTocTree(headings, data = DEFAULT_TOC_DATA) {
  const { minLevel, maxLevel } = normalizeTocData(data)
  const roots = []
  const stack = []
  for (const entry of headings) {
    if (entry.level < minLevel || entry.level > maxLevel) continue
    const node = { id: entry.id, level: entry.level, text: entry.text, children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

/** Injective encoding over UTF-16 units: safe even for arbitrary block IDs. */
export function tocAnchorId(blockId, prefix = 'rector-toc-heading-') {
  if (typeof blockId !== 'string' || !blockId) throw new TypeError('blockId is required')
  if (typeof prefix !== 'string' || !/^[A-Za-z][A-Za-z0-9-]*$/.test(prefix)) {
    throw new TypeError('anchor prefix must contain ASCII letters, digits or hyphens')
  }
  let suffix = ''
  for (let i = 0; i < blockId.length; i++) {
    suffix += blockId.charCodeAt(i).toString(16).padStart(4, '0')
  }
  return prefix + suffix
}
