import { collectTocHeadings } from './model.js'

const EMPTY_DOCUMENT = Object.freeze({ version: '2.0.0', blocks: [] })

function sameHeadings(left, right) {
  return left.length === right.length && left.every((item, index) =>
    item.id === right[index].id && item.level === right[index].level && item.text === right[index].text)
}

/** Source owned by the application. One instance per editor or rendered document. */
export function createTocSource(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('TOC source options must be an object')
  }
  const extraction = {
    inlineToText: options.inlineToText,
    textFromBlock: options.textFromBlock,
  }
  if (extraction.inlineToText !== undefined && typeof extraction.inlineToText !== 'function') {
    throw new TypeError('inlineToText must be a function')
  }
  if (extraction.textFromBlock !== undefined && typeof extraction.textFromBlock !== 'function') {
    throw new TypeError('textFromBlock must be a function')
  }
  if (options.onError !== undefined && typeof options.onError !== 'function') {
    throw new TypeError('onError must be a function')
  }

  let headings = collectTocHeadings(options.document ?? EMPTY_DOCUMENT, extraction)
  let destroyed = false
  let binding = null
  const subscribers = new Set()
  const assertLive = () => {
    if (destroyed) throw new Error('TOC source is destroyed')
  }
  const report = error => {
    try {
      const result = options.onError?.(error)
      if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {})
    } catch {}
  }
  const setDocument = documentData => {
    assertLive()
    const next = collectTocHeadings(documentData, extraction)
    if (sameHeadings(headings, next)) return
    headings = next
    for (const callback of [...subscribers]) {
      if (!subscribers.has(callback)) continue
      try { callback(headings) } catch (error) { report(error) }
    }
  }

  const bindEditor = editor => {
    assertLive()
    if (binding) throw new Error('TOC source is already bound to an editor')
    if (!editor || typeof editor.save !== 'function' || typeof editor.on !== 'function') {
      throw new TypeError('bindEditor requires a Rector editor handle')
    }
    setDocument(editor.save())
    let active = true
    let offCommitted = () => {}
    let offDestroyed = () => {}
    const unbind = () => {
      if (!active) return
      active = false
      binding = null
      offCommitted()
      offDestroyed()
    }
    try {
      offCommitted = editor.on('transaction:committed', event => {
        if (!active) return
        // Reorder, whole-document replacement, or editing a Heading can affect TOC.
        const relevant = event.changes.some(change =>
          change.kind === 'document.replace' || change.kind === 'block.move'
          || (change.kind === 'block.insert' || change.kind === 'block.remove')
            && change.block?.type === 'heading'
          || change.kind === 'block.update'
            && (change.before?.type === 'heading' || change.after?.type === 'heading'))
        if (relevant) {
          try { setDocument(editor.save()) } catch (error) { report(error) }
        }
      })
      offDestroyed = editor.on('editor:destroyed', unbind)
      binding = unbind
      return unbind
    } catch (error) {
      unbind()
      throw error
    }
  }

  return Object.freeze({
    getHeadings() { assertLive(); return headings },
    setDocument,
    bindEditor,
    subscribe(callback) {
      assertLive()
      if (typeof callback !== 'function') throw new TypeError('TOC listener must be a function')
      subscribers.add(callback)
      let active = true
      return () => { if (active) { active = false; subscribers.delete(callback) } }
    },
    destroy() {
      if (destroyed) return
      binding?.()
      destroyed = true
      subscribers.clear()
      headings = Object.freeze([])
    },
  })
}
