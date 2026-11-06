import test from 'node:test'
import assert from 'node:assert/strict'
import { collectTocHeadings, createTocSource } from '../src/index.js'

function inlineDefinition(type, render) {
  return {
    type,
    schema: {
      currentVersion: 1,
      decode({ dataVersion, data }) {
        if (dataVersion !== 1) throw new RangeError('Invalid inline widget version')
        return { dataVersion: 1, data: { ...data } }
      },
    },
    toText: render,
  }
}
function heading(html, inline) {
  return { version: '2.0.0', blocks: [{
    id: 'h', type: 'heading', data: { text: html, level: 2 }, inline,
  }] }
}

test('TOC derives labels from the registered inline definitions, without type switches', () => {
  const inlinePlugins = [
    inlineDefinition('mention', data => '@' + data.name),
    inlineDefinition('color', data => data.value),
    inlineDefinition('custom', data => '[' + data.label + ']'),
  ]
  const documentData = heading('Hello {{m}} in {{c}} {{b}} {{unknown}}', {
    m: { type: 'mention', dataVersion: 1, data: { name: 'Ada' } },
    c: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
    b: { type: 'custom', dataVersion: 1, data: { label: 'Badge' } },
    unknown: { type: 'missing', dataVersion: 1, data: { value: 'opaque' } },
  })
  assert.equal(collectTocHeadings(documentData, { inlinePlugins })[0].text,
    'Hello @Ada in #123456 [Badge] {{unknown}}')
  const source = createTocSource({ inlinePlugins, document: documentData })
  assert.equal(source.getHeadings()[0].text, 'Hello @Ada in #123456 [Badge] {{unknown}}')
  source.destroy()
})

test('TOC never resolves a token inside the canonical oe-inline-literal marker', () => {
  const inlinePlugins = [inlineDefinition('mention', data => '@' + data.name)]
  const documentData = heading(
    'Real {{m}} and <span class="extra oe-inline-literal"><span>{{m}}</span></span>',
    { m: { type: 'mention', dataVersion: 1, data: { name: 'Ada' } } },
  )
  assert.equal(collectTocHeadings(documentData, { inlinePlugins })[0].text,
    'Real @Ada and {{m}}')
})

test('TOC captures inline definitions once and respects schema versions and toText receiver', () => {
  const definition = inlineDefinition('mention', function (data) { return this.prefix + data.name })
  definition.prefix = '@'
  const inlinePlugins = [definition]
  const source = createTocSource({ inlinePlugins })
  inlinePlugins.length = 0
  definition.toText = () => 'unexpected'
  source.setDocument(heading('{{m}}', {
    m: { type: 'mention', dataVersion: 1, data: { name: 'Ada' } },
  }))
  assert.equal(source.getHeadings()[0].text, '@Ada')
  assert.throws(() => source.setDocument(heading('{{m}}', {
    m: { type: 'mention', dataVersion: 2, data: { name: 'Ada' } },
  })), /version/)
  source.destroy()
})

test('TOC rejects duplicate inline definitions and non-string toText results', () => {
  assert.throws(() => createTocSource({
    inlinePlugins: [inlineDefinition('x', () => 'x'), inlineDefinition('x', () => 'x')],
  }), /duplicate/i)
  assert.throws(() => collectTocHeadings(heading('{{m}}', {
    m: { type: 'mention', dataVersion: 1, data: { name: 'Ada' } },
  }), { inlinePlugins: [inlineDefinition('mention', () => Promise.resolve('bad'))] }), /string/)
})

test('TOC retains custom fallback for types without a toText definition', () => {
  const definition = { type: 'legacy', schema: { currentVersion: 1 } }
  assert.equal(collectTocHeadings(heading('{{l}}', {
    l: { type: 'legacy', dataVersion: 1, data: { text: 'Manual' } },
  }), {
    inlinePlugins: [definition],
    inlineToText: widget => widget.type === 'legacy' ? widget.data.text : null,
  })[0].text, 'Manual')
})

test('TOC passes a frozen, detached decoded payload to inline toText', () => {
  const payload = { name: 'Ada', nested: { value: 'original' } }
  const inlinePlugins = [inlineDefinition('mention', data => {
    assert.ok(Object.isFrozen(data))
    assert.ok(Object.isFrozen(data.nested))
    assert.throws(() => { data.nested.value = 'changed' }, TypeError)
    return '@' + data.name
  })]
  const doc = heading('{{m}}', { m: { type: 'mention', dataVersion: 1, data: payload } })
  assert.equal(collectTocHeadings(doc, { inlinePlugins })[0].text, '@Ada')
  assert.equal(payload.nested.value, 'original')
})
