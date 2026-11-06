import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TOC_DATA, tocSchema, collectTocHeadings, htmlToText,
  buildTocTree, tocAnchorId,
} from '../src/index.js'

const documentData = {
  version: '2.0.0',
  blocks: [
    { id: 'a', type: 'heading', data: { level: 2, text: '<strong>Introduction</strong> &amp; scope' } },
    { id: 'paragraph', type: 'paragraph', data: { text: 'not a heading' } },
    { id: 'b', type: 'heading', data: { level: 4, text: 'Advanced &lt;methods&gt;' } },
    { id: 'c', type: 'heading', data: { level: 3, text: 'More<br>details' } },
    { id: 'd', type: 'heading', data: { level: 2, text: '  ' } },
    { id: 'e', type: 'heading', data: { level: 6, text: '&#x1F680; Launch' } },
  ],
}

test('schema validates exact version, owns defaults and refuses malformed options', () => {
  assert.deepEqual(tocSchema.createDefault(), DEFAULT_TOC_DATA)
  assert.notStrictEqual(tocSchema.createDefault(), DEFAULT_TOC_DATA)
  assert.deepEqual(tocSchema.encode({ title: '', minLevel: 3, maxLevel: 5, numbered: true }), {
    dataVersion: 1, data: { title: '', minLevel: 3, maxLevel: 5, numbered: true },
  })
  assert.throws(() => tocSchema.decode({ dataVersion: 2, data: {} }), /dataVersion/)
  assert.throws(() => tocSchema.encode({ title: '', minLevel: 4, maxLevel: 3, numbered: false }), /levels/)
  assert.throws(() => tocSchema.encode({ title: '', minLevel: 2, maxLevel: 6, numbered: 1 }), /boolean/)
  assert.throws(() => tocSchema.decode({ dataVersion: 1, data: { other: 1 } }), /Unknown/)
  assert.throws(() => tocSchema.decode({ dataVersion: 1, data: [] }), /object/)
})

test('headings are extracted from sanitized rich text without evaluating HTML', () => {
  const headings = collectTocHeadings(documentData)
  assert.deepEqual(headings.map(({ id, level, text }) => [id, level, text]), [
    ['a', 2, 'Introduction & scope'], ['b', 4, 'Advanced <methods>'],
    ['c', 3, 'More details'], ['e', 6, '🚀 Launch'],
  ])
  assert.ok(Object.isFrozen(headings) && headings.every(Object.isFrozen))
  assert.equal(htmlToText('<span title="a > b">Title</span>'), 'Title')
  assert.equal(htmlToText('<b>Bad &unknown; &#0;</b>'), 'Bad &unknown; �')
  assert.throws(() => collectTocHeadings({ blocks: null }), /document/)
})

test('custom inline-to-text resolves widgets, but not unmatched literals', () => {
  const doc = { version: '2.0.0', blocks: [{
    id: 'p', type: 'heading', data: { level: 2, text: 'Hello {{a}} {{missing}} &amp;!' },
    inline: { a: { type: 'mention', data: { name: 'Alice <Admin>' } } },
  }] }
  assert.equal(collectTocHeadings(doc, { inlineToText: widget => widget.data.name })[0].text,
    'Hello Alice <Admin> {{missing}} &!')
  assert.equal(collectTocHeadings(doc)[0].text, 'Hello {{a}} {{missing}} &!')
  assert.throws(() => collectTocHeadings(doc, { textFromBlock: () => 1 }), /string/)
})

test('nesting preserves heading-level skips and filters levels', () => {
  const headings = collectTocHeadings(documentData)
  const tree = buildTocTree(headings)
  assert.equal(tree.length, 1)
  assert.equal(tree[0].text, 'Introduction & scope')
  assert.equal(tree[0].children[0].level, 4)
  assert.equal(tree[0].children[1].level, 3)
  assert.equal(tree[0].children[1].children[0].level, 6)
  const filtered = buildTocTree(headings, { title: 'X', minLevel: 3, maxLevel: 4, numbered: false })
  assert.deepEqual(filtered.map(x => [x.level, x.children.length]), [[4, 0], [3, 0]])
})

test('anchor IDs are deterministic, injective for arbitrary block ids and safe', () => {
  const ids = ['', 'a', 'a-1', 'a%2D1', 'a\uD83D\uDE80', '../', '0 1']
    .filter(Boolean).map(id => tocAnchorId(id))
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every(id => /^rector-toc-heading-[0-9a-f]+$/.test(id)))
  assert.throws(() => tocAnchorId('x', 'foo#'), /prefix/)
})

test('malformed HTML-like tails are handled without quadratic rescanning', () => {
  const malformed = '<a '.repeat(15000)
  const start = performance.now()
  assert.equal(htmlToText(malformed), malformed.trim())
  assert.ok(performance.now() - start < 500, 'tagless malformed HTML must be processed linearly')
})
