import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTocPlugin, createTocRenderer, createTocSource, applyTocAnchors, tocAnchorId,
  renderTocDocument,
} from '../src/index.js'

class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc
    this.tagName = tag.toUpperCase()
    this.children = []
    this.parentElement = null
    this.dataset = {}
    this.className = ''
    this.id = ''
    this.attributes = new Map()
    this.events = new Map()
    this.value = ''
    this.checked = false
    this._text = ''
    this.contentEditable = ''
  }
  set textContent(value) { this.children = []; this._text = String(value) }
  get textContent() { return this._text + this.children.map(child => child.textContent).join('') }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child }
  append(...children) { children.forEach(child => this.appendChild(child)) }
  replaceChildren(...children) { this.children.forEach(c => { c.parentElement = null }); this.children = []; this._text = ''; this.append(...children) }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  addEventListener(type, callback) { const group = this.events.get(type) ?? new Set(); group.add(callback); this.events.set(type, group) }
  removeEventListener(type, callback) { this.events.get(type)?.delete(callback) }
  emit(type, event) { for (const callback of this.events.get(type) ?? []) callback(event) }
  contains(node) { return node === this || this.children.some(child => child.contains(node)) }
  closest(selector) {
    if (selector === '.oe-editor' && this.className.split(' ').includes('oe-editor')) return this
    return this.parentElement?.closest(selector) ?? null
  }
  querySelectorAll(selector) {
    const result = []
    const walk = node => {
      for (const child of node.children) {
        if (selector === '[data-block-type="heading"][data-block-id]'
          && child.dataset.blockType === 'heading' && child.dataset.blockId) result.push(child)
        walk(child)
      }
    }
    walk(this)
    return result
  }
  scrollIntoView() { this.scrolled = true }
  focus() { this.focused = true }
}
const document = { createElement(tag) { return new FakeElement(this, tag) } }
const documentData = {
  version: '2.0.0', blocks: [
    { id: 'h2', type: 'heading', dataVersion: 2, data: { level: 2, text: 'Start' } },
    { id: 'toc', type: 'toc', dataVersion: 1, data: { title: 'Contents', minLevel: 2, maxLevel: 6, numbered: false } },
    { id: 'h3', type: 'heading', dataVersion: 2, data: { level: 3, text: 'Child' } },
  ],
}

test('block plugin produces a usable Rector v2 contract and updates a live view', () => {
  const source = createTocSource({ document: documentData })
  const definition = createTocPlugin({ source, injectStyles: false })
  assert.equal(definition.type, 'toc')
  assert.equal(definition.schema.currentVersion, 1)
  assert.ok(Object.isFrozen(definition) && Object.isFrozen(definition.styles))
  assert.deepEqual(definition.styles, [])
  const runtime = definition.setup({ ownerDocument: document, signal: new AbortController().signal })
  const controller = new AbortController()
  const block = runtime.create(definition.schema.createDefault(), {
    ownerDocument: document, signal: controller.signal, isReadOnly: () => false,
  })
  assert.equal(block.element.tagName, 'NAV')
  assert.equal(block.element.children[1].tagName, 'UL')
  assert.equal(block.element.children[1].children[0].children[1].tagName, 'UL')
  assert.equal(block.element.children[1].children[0].children[0].getAttribute('href'), '#'+tocAnchorId('h2'))
  source.setDocument({ version: '2.0.0', blocks: documentData.blocks.slice(1) })
  assert.equal(block.element.children[1].children[0].children[0].textContent, 'Child')
  assert.deepEqual(block.read(), definition.schema.createDefault())
  block.update({ title: '', minLevel: 3, maxLevel: 4, numbered: true })
  assert.equal(block.element.children.length, 1)
  assert.equal(block.element.children[0].tagName, 'OL')
  assert.deepEqual(block.read(), { title: '', minLevel: 3, maxLevel: 4, numbered: true })
  controller.abort()
  block.destroy()
  source.setDocument({ version: '2.0.0', blocks: documentData.blocks })
  assert.equal(block.element.children.length, 1) // retired view not touched
  runtime.destroy()
  source.destroy()
})

test('settings panel commits schema-compatible single transactions', () => {
  const source = createTocSource()
  const def = createTocPlugin({ source })
  let current = def.schema.createDefault()
  const panel = def.capabilities.settings.render({
    ownerDocument: document,
    getData: () => current,
    updateData: producer => { current = def.schema.encode(producer(current)).data },
  })
  const [title, minLevel, maxLevel, numbered] = panel.children.map(label => label.children[1])
  title.value = 'Navigation'; title.emit('change', {})
  minLevel.value = '5'; minLevel.emit('change', {})
  maxLevel.value = '3'; maxLevel.emit('change', {})
  numbered.checked = true; numbered.emit('change', {})
  assert.deepEqual(current, { title: 'Navigation', minLevel: 3, maxLevel: 3, numbered: true })
  assert.equal(minLevel.value, '3', 'panel must reflect auto-adjusted minimum')
  assert.equal(maxLevel.value, '3', 'panel must reflect canonical maximum')
  source.destroy()
})

test('renderer subscriptions clean up and headings get stable anchors', () => {
  const source = createTocSource({ document: documentData })
  const renderer = createTocRenderer({ source, injectStyles: false })
  assert.equal(renderer.type, 'toc')
  const toc = renderer.render(documentData.blocks[1], null, { ownerDocument: document })
  assert.equal(toc.textContent, 'ContentsStartChild')
  source.setDocument({ version: '2.0.0', blocks: documentData.blocks.slice(1) })
  assert.equal(toc.textContent, 'ContentsChild')
  renderer.destroy(toc)
  source.setDocument(documentData)
  assert.equal(toc.textContent, 'ContentsChild')
  const root = document.createElement('div')
  const heading = document.createElement('h2')
  heading.dataset.blockType = 'heading'
  heading.dataset.blockId = 'h2'
  root.append(heading)
  assert.equal(applyTocAnchors(root), 1)
  assert.equal(heading.id, tocAnchorId('h2'))
  const mockRenderer = { renderTo(_doc, container) { container.appendChild(document.createElement('nav')) } }
  renderTocDocument(mockRenderer, documentData, root, { source })
  assert.deepEqual(source.getHeadings().map(h => h.id), ['h2', 'h3'])
  source.destroy()
})

test('navigation inside editor scrolls only its own target and cleans click handlers', () => {
  const source = createTocSource({ document: documentData })
  const plugin = createTocPlugin({ source, injectStyles: false })
  const controller = new AbortController()
  const instance = plugin.setup({}).create(plugin.schema.createDefault(), {
    ownerDocument: document, signal: controller.signal, isReadOnly: () => true,
  })
  const editorRoot = document.createElement('div'); editorRoot.className = 'oe-editor'
  const heading = document.createElement('h2'); heading.dataset.blockType = 'heading'; heading.dataset.blockId = 'h2'
  editorRoot.append(instance.element, heading)
  const link = instance.element.children[1].children[0].children[0]
  let prevented = false
  instance.element.emit('click', { target: { closest() { return link } }, preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(heading.scrolled, true)
  instance.destroy()
  assert.equal(instance.element.events.get('click').size, 0)
  source.destroy()
})

test('a rejected output render must not publish headings from the failed document', () => {
  const source = createTocSource({ document: documentData })
  const invalid = { version: '2.0.0', blocks: [
    { id: 'invalid', type: 'heading', dataVersion: 99, data: { text: 'Rejected heading', level: 2 } },
  ] }
  assert.throws(() => renderTocDocument({
    renderTo() { throw new Error('invalid document') },
  }, invalid, document.createElement('div'), { source }), /invalid document/)
  assert.deepEqual(source.getHeadings().map(item => item.text), ['Start', 'Child'])
  source.destroy()
})

test('aborting during TOC registration immediately releases the source subscription', () => {
  const controller = new AbortController()
  let releases = 0
  const source = {
    getHeadings: () => [],
    subscribe() {
      controller.abort()
      return () => { releases++ }
    },
  }
  const plugin = createTocPlugin({ source, injectStyles: false })
  const runtime = plugin.setup({})
  const instance = runtime.create(plugin.schema.createDefault(), {
    ownerDocument: document, signal: controller.signal, isReadOnly: () => false,
  })
  assert.equal(releases, 1, 'a retired block cannot retain an active TOC subscription')
  instance.destroy()
  assert.equal(releases, 1, 'cleanup must not release the same subscription twice')
  runtime.destroy()
})

test('block abort followed by destroy releases an external TOC subscription exactly once', () => {
  const controller = new AbortController()
  let releases = 0
  const source = {
    getHeadings: () => [],
    subscribe: () => () => { releases++ },
  }
  const plugin = createTocPlugin({ source, injectStyles: false })
  const runtime = plugin.setup({})
  const instance = runtime.create(plugin.schema.createDefault(), {
    ownerDocument: document, signal: controller.signal, isReadOnly: () => false,
  })
  controller.abort()
  assert.equal(releases, 1, 'abort releases the source subscription')
  instance.destroy()
  assert.equal(releases, 1, 'block destruction is idempotent after abort')
  runtime.destroy()
})


test('a failing TOC heading projection must not change the mounted renderer output', () => {
  const documentBefore = {
    version: '2.0.0',
    blocks: [{ id: 'before', type: 'heading', dataVersion: 2, data: { text: 'Before', level: 2 } }],
  }
  const source = createTocSource({
    document: documentBefore,
    textFromBlock(block) {
      if (block.id === 'bad') throw new Error('Cannot extract heading')
      return block.data.text
    },
  })
  const requested = {
    version: '2.0.0',
    blocks: [{ id: 'bad', type: 'heading', dataVersion: 2, data: { text: 'After', level: 2 } }],
  }
  let rendered = false
  assert.throws(() => renderTocDocument({
    renderTo() { rendered = true },
  }, requested, document.createElement('div'), { source }), /Cannot extract heading/)
  assert.equal(rendered, false, 'renderer must not mutate output after invalid TOC projection')
  assert.deepEqual(source.getHeadings().map(entry => entry.text), ['Before'])
  source.destroy()
})
