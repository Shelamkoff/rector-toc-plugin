import { collectTocHeadings } from './model.js'
import { createInlineTextResolver } from './inlineDefinitions.js'

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
  if (options.inlineToText !== undefined && typeof options.inlineToText !== 'function') {
    throw new TypeError('inlineToText must be a function')
  }
  const automaticToText = createInlineTextResolver(options.inlinePlugins)
  // Capture inline definitions once for a whole editor rather than rebuild
  // a type switch/map every time a Heading is edited.
  const extraction = {
    inlineToText: automaticToText || options.inlineToText
      ? (widget, block) => automaticToText?.(widget) ?? options.inlineToText?.(widget, block)
      : undefined,
    textFromBlock: options.textFromBlock,
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
  let delivering = false
  let superseded = false
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
  // A prepared projection can be validated before an external DOM renderer
  // mutates its output. Committing a prepared result never re-runs consumers'
  // possibly fallible canonical text extractors.
  const setDocument = documentData => publishHeadings(collectTocHeadings(documentData, extraction))
  const prepareDocument = documentData => {
    assertLive()
    const next = collectTocHeadings(documentData, extraction)
    let used = false
    return () => {
      assertLive()
      if (used) return
      used = true
      publishHeadings(next)
    }
  }
  const publishHeadings = next => {
    assertLive()
    if (sameHeadings(headings, next)) return
    headings = next
    if (delivering) { superseded = true; return }
    delivering = true
    try {
      do {
        superseded = false
        const snapshot = headings
        for (const callback of [...subscribers]) {
          if (destroyed) break
          // A reentrant update supersedes this notification; restart with
          // the current snapshot rather than send duplicate/stale values.
          if (headings !== snapshot) { superseded = true; break }
          if (!subscribers.has(callback)) continue
          try { callback(snapshot) } catch (error) { report(error) }
        }
      } while (superseded && !destroyed)
    } finally {
      delivering = false
    }
  }

  const bindEditor = editor => {
    assertLive()
    if (binding) throw new Error('TOC source is already bound to an editor')
    if (!editor || typeof editor.save !== 'function' || typeof editor.on !== 'function') {
      throw new TypeError('bindEditor requires a Rector editor handle')
    }
    let active = true
    let offCommitted = () => {}
    let offDestroyed = () => {}
    const unbind = () => {
      if (!active) return
      active = false
      if (binding === unbind) binding = null
      const releases = [offCommitted, offDestroyed]
      offCommitted = () => {}
      offDestroyed = () => {}
      for (const release of releases) {
        try { release() } catch (error) { report(error) }
      }
    }
    // Claim this source before calling application-owned save/observers.
    // They can synchronously destroy it, attempt a second binding, or throw.
    binding = unbind
    try {
      // Observe commits BEFORE publishing the initial snapshot. Subscribers
      // may synchronously edit the document in response to that publication;
      // registering afterward would drop their committed changes.
      const committed = editor.on('transaction:committed', event => {
        if (!active) return
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
      if (typeof committed !== 'function') throw new TypeError('Editor event subscription must return an unsubscribe function')
      if (!active) { committed(); throw new Error('TOC source retired during editor binding') }
      offCommitted = committed
      const destroyed = editor.on('editor:destroyed', unbind)
      if (typeof destroyed !== 'function') throw new TypeError('Editor event subscription must return an unsubscribe function')
      if (!active) { destroyed(); throw new Error('TOC source retired during editor binding') }
      offDestroyed = destroyed
      // Re-read the canonical model after both observers are installed.
      // A nested update during notification will now be delivered normally.
      setDocument(editor.save())
      assertLive()
      if (!active) throw new Error('TOC source retired during editor binding')
      return unbind
    } catch (error) {
      unbind()
      throw error
    }
  }

  return Object.freeze({
    getHeadings() { assertLive(); return headings },
    setDocument,
    prepareDocument,
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
      // Revoke before consumer-owned unsubscribe hooks run.
      destroyed = true
      binding?.()
      subscribers.clear()
      headings = Object.freeze([])
    },
  })
}
