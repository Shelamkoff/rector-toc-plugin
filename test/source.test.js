import test from 'node:test'
import assert from 'node:assert/strict'
import { createTocSource } from '../src/index.js'

const heading = (id, text, level = 2) => ({ id, type: 'heading', data: { text, level } })
const doc = (...blocks) => ({ version: '2.0.0', blocks })
function createMockEditor(initial) {
  let value = initial
  let saves = 0
  const listeners = new Map()
  return {
    save() { saves++; return value },
    get saves() { return saves },
    setDocument(next) { value = next },
    on(type, callback) {
      const set = listeners.get(type) ?? new Set()
      set.add(callback)
      listeners.set(type, set)
      return () => set.delete(callback)
    },
    emit(type, payload) {
      for (const callback of [...(listeners.get(type) ?? [])]) callback(payload)
    },
    listeners(type) { return listeners.get(type)?.size ?? 0 },
  }
}

test('source emits only semantic heading changes, not paragraphs or identical snapshots', () => {
  const source = createTocSource({ document: doc(heading('a', 'Start')) })
  const seen = []
  const off = source.subscribe(x => seen.push(x.map(y => y.text).join(',')))
  const editor = createMockEditor(doc(heading('a', 'Start')))
  source.bindEditor(editor)
  assert.equal(editor.saves, 1)
  editor.emit('transaction:committed', { changes: [{ kind: 'block.update', before: { type: 'paragraph' }, after: { type: 'paragraph' } }] })
  assert.equal(editor.saves, 1)
  editor.setDocument(doc(heading('a', 'Changed')))
  editor.emit('transaction:committed', { changes: [{ kind: 'block.update', before: heading('a', 'Start'), after: heading('a', 'Changed') }] })
  assert.equal(editor.saves, 2)
  assert.deepEqual(seen, ['Changed'])
  source.setDocument(doc(heading('a', 'Changed')))
  assert.deepEqual(seen, ['Changed'])
  editor.emit('editor:destroyed')
  assert.equal(editor.listeners('transaction:committed'), 0)
  off()
  source.destroy()
  assert.throws(() => source.getHeadings(), /destroyed/)
})

test('reorder, insert, remove and replacement update headings without reentering commands', () => {
  const editor = createMockEditor(doc(heading('a', 'A'), heading('b', 'B')))
  const source = createTocSource()
  const unbind = source.bindEditor(editor)
  const observed = []
  source.subscribe(x => observed.push(x.map(h => h.id).join(',')))
  editor.setDocument(doc(heading('b', 'B'), heading('a', 'A')))
  editor.emit('transaction:committed', { changes: [{ kind: 'block.move', id: 'b' }] })
  editor.setDocument(doc(heading('b', 'B'), heading('a', 'A'), heading('c', 'C')))
  editor.emit('transaction:committed', { changes: [{ kind: 'block.insert', block: heading('c', 'C') }] })
  editor.setDocument(doc(heading('b', 'B'), heading('c', 'C')))
  editor.emit('transaction:committed', { changes: [{ kind: 'block.remove', block: heading('a', 'A') }] })
  editor.setDocument(doc())
  editor.emit('transaction:committed', { changes: [{ kind: 'document.replace' }] })
  assert.deepEqual(observed, ['b,a', 'b,a,c', 'b,c', ''])
  unbind()
  assert.equal(editor.listeners('editor:destroyed'), 0)
  source.destroy()
})

test('observer exceptions are isolated and a source cannot bind twice', () => {
  const errors = []
  const source = createTocSource({ onError: error => errors.push(error.message) })
  source.subscribe(() => { throw new Error('listener failed') })
  let calls = 0
  source.subscribe(() => calls++)
  source.setDocument(doc(heading('a', 'A')))
  assert.deepEqual(errors, ['listener failed'])
  assert.equal(calls, 1)
  const editor = createMockEditor(doc())
  source.bindEditor(editor)
  assert.throws(() => source.bindEditor(editor), /already bound/)
  source.destroy()
})


test('destroy during initial binding does not subscribe a disposed source', () => {
  const editor = createMockEditor(doc(heading('a', 'A')))
  const source = createTocSource()
  source.subscribe(() => source.destroy())
  assert.throws(() => source.bindEditor(editor), /destroyed|retired/i)
  assert.equal(editor.listeners('transaction:committed'), 0)
  assert.equal(editor.listeners('editor:destroyed'), 0)
})

test('a source cannot be rebound reentrantly during initial document notification', () => {
  const editor = createMockEditor(doc(heading('a', 'A')))
  const foreignEditor = createMockEditor(doc(heading('foreign', 'F')))
  const source = createTocSource()
  let rejected = false
  source.subscribe(() => {
    try { source.bindEditor(foreignEditor) }
    catch (error) { rejected = /already bound/.test(error.message) }
  })
  const unbind = source.bindEditor(editor)
  assert.equal(rejected, true)
  assert.equal(foreignEditor.listeners('transaction:committed'), 0)
  assert.deepEqual(source.getHeadings().map(item => item.text), ['A'])
  unbind()
  source.destroy()
})


test('destroy finishes independent unsubscribe operations even if one throws', () => {
  const failures = []
  const source = createTocSource({ onError: error => failures.push(error.message) })
  const docSnapshot = doc(heading('a', 'A'))
  const listeners = new Map()
  const editor = {
    save: () => docSnapshot,
    on(type, listener) {
      const items = listeners.get(type) ?? new Set()
      items.add(listener)
      listeners.set(type, items)
      return () => {
        items.delete(listener)
        if (type === 'transaction:committed') throw new Error('failing unsubscribe')
      }
    },
  }
  source.bindEditor(editor)
  assert.doesNotThrow(() => source.destroy())
  assert.deepEqual(failures, ['failing unsubscribe'])
  assert.equal(listeners.get('transaction:committed').size, 0)
  assert.equal(listeners.get('editor:destroyed').size, 0)
  assert.throws(() => source.getHeadings(), /destroyed/)
  assert.doesNotThrow(() => source.destroy())
})

test('destroy prevents a callback from rebinding a source while unsubscribing', () => {
  const source = createTocSource()
  const other = createMockEditor(doc(heading('elsewhere', 'Elsewhere')))
  const warnings = []
  const editor = {
    save: () => doc(heading('a', 'A')),
    on(type) {
      return () => {
        if (type === 'transaction:committed') {
          try { source.bindEditor(other) }
          catch (error) { warnings.push(error.message) }
        }
      }
    },
  }
  source.bindEditor(editor)
  source.destroy()
  assert.equal(other.listeners('transaction:committed'), 0)
  assert.deepEqual(warnings, ['TOC source is destroyed'])
})


test('reentrant updates notify remaining subscribers once with the latest heading snapshot', () => {
  const source = createTocSource()
  const seen = []
  source.subscribe(headings => {
    if (headings[0]?.text === 'Initial') {
      source.setDocument(doc(heading('a', 'Latest')))
    }
  })
  source.subscribe(headings => seen.push(headings.map(h => h.text).join(',')))
  source.setDocument(doc(heading('a', 'Initial')))
  assert.deepEqual(seen, ['Latest'])
  assert.deepEqual(source.getHeadings().map(h => h.text), ['Latest'])
  source.destroy()
})


test('binding observes a heading edit triggered by initial TOC subscribers', () => {
  const editor = createMockEditor(doc(heading('a', 'First')))
  const source = createTocSource()
  source.subscribe(headings => {
    if (headings[0]?.text !== 'First') return
    editor.setDocument(doc(heading('a', 'Second')))
    editor.emit('transaction:committed', {
      changes: [{ kind: 'block.update',
        id: 'a', before: heading('a', 'First'), after: heading('a', 'Second') }],
    })
  })
  const unbind = source.bindEditor(editor)
  assert.deepEqual(source.getHeadings().map(item => item.text), ['Second'])
  unbind()
  source.destroy()
})


test('single heading edits use committed block changes without saving the entire document', () => {
  const originalHeading = heading('h', 'Before')
  const editor = createMockEditor(doc(
    ...Array.from({ length: 500 }, (_, index) =>
      ({ id: 'p' + index, type: 'paragraph', data: { text: 'Body ' + index } })),
    originalHeading,
  ))
  const source = createTocSource()
  const unbind = source.bindEditor(editor)
  assert.equal(editor.saves, 1)
  const changedHeading = heading('h', 'After')
  editor.setDocument(doc(changedHeading))
  editor.emit('transaction:committed', {
    changes: [{
      kind: 'block.update',
      id: 'h',
      before: originalHeading,
      after: changedHeading,
    }],
  })
  assert.deepEqual(source.getHeadings().map(item => item.text), ['After'])
  assert.equal(editor.saves, 1, 'a single block update must not clone all editor blocks again')
  unbind()
  source.destroy()
})

test('prepared TOC projections publish only after commit and do not repeat notifications', () => {
  const source = createTocSource({ document: doc(heading('h', 'Old')) })
  const seen = []
  source.subscribe(snapshot => seen.push(snapshot[0]?.text))
  const publish = source.prepareDocument(doc(heading('h', 'New')))
  assert.deepEqual(source.getHeadings().map(item => item.text), ['Old'])
  assert.deepEqual(seen, [])
  publish()
  publish()
  assert.deepEqual(source.getHeadings().map(item => item.text), ['New'])
  assert.deepEqual(seen, ['New'])
  source.destroy()
  assert.throws(() => source.prepareDocument(doc(heading('h', 'Post-destroy'))), /destroyed/)
})
