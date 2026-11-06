import { createTocView, applyTocAnchors } from './dom.js'
import { tocSchema, TOC_TYPE, tocAnchorId } from './model.js'

const CSS = new URL('./toc.css', import.meta.url).href

/** Pair with createTocPlugin using the same data schema. */
export function createTocRenderer(options = {}) {
  const { source, anchorPrefix, navigate } = options
  if (!source || typeof source.getHeadings !== 'function' || typeof source.subscribe !== 'function') {
    throw new TypeError('createTocRenderer requires a source with getHeadings and subscribe')
  }
  if (anchorPrefix !== undefined) tocAnchorId('probe', anchorPrefix)
  if (navigate !== undefined && typeof navigate !== 'function') {
    throw new TypeError('navigate must be a function')
  }
  const styles = options.injectStyles === false ? [] : [CSS]
  if (options.css !== undefined) {
    if (typeof options.css !== 'string') throw new TypeError('css must be a string')
    styles.push(options.css)
  }
  const mounted = new WeakMap()
  return {
    type: TOC_TYPE,
    schema: tocSchema,
    styles,
    render(block, _parseInline, context = { ownerDocument: globalThis.document }) {
      const data = tocSchema.decode({ dataVersion: block.dataVersion, data: block.data }).data
      const view = createTocView(context.ownerDocument, { anchorPrefix, navigate })
      try {
        view.render(data, source.getHeadings())
        const unsubscribe = source.subscribe(headings => view.render(data, headings))
        if (typeof unsubscribe !== 'function') {
          throw new TypeError('TOC source.subscribe must return an unsubscribe function')
        }
        let disposed = false
        mounted.set(view.element, () => {
          if (disposed) return
          disposed = true
          // The source is application-owned; a failing unsubscribe must not
          // retain the renderer's own navigation event listener.
          try { unsubscribe() }
          finally { view.destroy() }
        })
        return view.element
      } catch (error) {
        // The renderer never received this output, so Rector cannot destroy it.
        view.destroy()
        throw error
      }
    },
    destroy(element) {
      const cleanup = mounted.get(element)
      if (cleanup) { mounted.delete(element); cleanup() }
    },
  }
}

/** Render a snapshot and synchronize both TOC entries and heading fragments. */
export function renderTocDocument(renderer, documentData, container, { source, anchorPrefix } = {}) {
  if (!source || typeof source.setDocument !== 'function') {
    throw new TypeError('renderTocDocument requires a writable TOC source')
  }
  // The source can precompute its fallible read-only projection before the
  // renderer changes any DOM. Only publish after Rector accepts the document.
  const commit = source.prepareDocument?.(documentData)
  if (commit !== undefined && typeof commit !== 'function') {
    throw new TypeError('TOC source prepareDocument must return a commit function')
  }
  renderer.renderTo(documentData, container)
  if (commit) commit()
  else source.setDocument(documentData)
  applyTocAnchors(container, { anchorPrefix })
}
