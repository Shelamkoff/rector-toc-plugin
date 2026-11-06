import { tocSchema, TOC_TYPE, tocAnchorId } from './model.js'
import { createTocView } from './dom.js'

const CSS = new URL('./toc.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>'

function settingsPanel(context) {
  const doc = context.ownerDocument
  const panel = doc.createElement('div')
  panel.className = 'rector-toc__settings'
  const value = context.getData()
  const controls = new Map()
  const syncControls = () => {
    const canonical = context.getData()
    for (const [field, input] of controls) {
      if (field === 'numbered') input.checked = canonical.numbered
      else input.value = String(canonical[field])
    }
  }
  const addField = (name, field, input, onChange) => {
    const label = doc.createElement('label')
    label.className = 'rector-toc__setting'
    const span = doc.createElement('span')
    span.textContent = name
    label.append(span, input)
    panel.appendChild(label)
    controls.set(field, input)
    input.addEventListener('change', () => {
      try { context.updateData(current => onChange(current, input)) }
      finally {
        // Settings panels are not remounted after model-first updates. A min/max
        // adjustment can change the other input; reconcile all live controls.
        try { syncControls() } catch { /* The panel may have been retired. */ }
      }
    })
  }
  const title = doc.createElement('input')
  title.type = 'text'
  title.value = value.title
  addField('Title', 'title', title, (current, input) => ({ ...current, title: input.value }))

  for (const [property, label] of [['minLevel', 'First heading level'], ['maxLevel', 'Last heading level']]) {
    const select = doc.createElement('select')
    for (let level = 2; level <= 6; level++) {
      const option = doc.createElement('option')
      option.value = String(level)
      option.textContent = 'H' + level
      select.appendChild(option)
    }
    select.value = String(value[property])
    addField(label, property, select, (current, input) => {
      const level = Number(input.value)
      return property === 'minLevel'
        ? { ...current, minLevel: level, maxLevel: Math.max(level, current.maxLevel) }
        : { ...current, maxLevel: level, minLevel: Math.min(level, current.minLevel) }
    })
  }
  const numbered = doc.createElement('input')
  numbered.type = 'checkbox'
  numbered.checked = value.numbered
  addField('Numbered list', 'numbered', numbered, (current, input) => ({ ...current, numbered: input.checked }))
  return panel
}

/** Register a live TOC block. Each editor needs its own bound source. */
export function createTocPlugin(options = {}) {
  const { source, anchorPrefix, navigate } = options
  if (!source || typeof source.getHeadings !== 'function' || typeof source.subscribe !== 'function') {
    throw new TypeError('createTocPlugin requires a source with getHeadings and subscribe')
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
  return Object.freeze({
    type: TOC_TYPE,
    icon: ICON,
    label: Object.freeze({ key: 'title', fallback: 'Table of contents' }),
    styles: Object.freeze(styles),
    schema: tocSchema,
    capabilities: Object.freeze({
      empty: Object.freeze({ isEmpty: () => false }),
      settings: Object.freeze({ kind: 'panel', render: settingsPanel }),
    }),
    setup(context) {
      let destroyed = false
      return {
        create(initial, blockContext) {
          if (destroyed) throw new Error('TOC runtime is destroyed')
          const view = createTocView(blockContext.ownerDocument, { anchorPrefix, navigate })
          let data = tocSchema.encode(initial).data
          let instanceDestroyed = false
          const updateView = headings => {
            if (!instanceDestroyed && !blockContext.signal.aborted) view.render(data, headings)
          }
          updateView(source.getHeadings())
          let unsubscribe
          try {
            unsubscribe = source.subscribe(updateView)
            if (typeof unsubscribe !== 'function') {
              throw new TypeError('TOC source.subscribe must return an unsubscribe function')
            }
          } catch (error) {
            view.destroy()
            throw error
          }
          let subscriptionReleased = false
          const releaseSubscription = () => {
            if (subscriptionReleased) return
            subscriptionReleased = true
            blockContext.signal.removeEventListener('abort', releaseSubscription)
            unsubscribe()
          }
          // An application-owned source may abort the block synchronously during
          // subscribe(). Registering a listener after that would retain a dead
          // subscription forever. It must also be released at most once.
          if (blockContext.signal.aborted) releaseSubscription()
          else blockContext.signal.addEventListener('abort', releaseSubscription, { once: true })
          return {
            element: view.element,
            read() { return { ...data } },
            update(next) { data = tocSchema.encode(next).data; updateView(source.getHeadings()) },
            setReadOnly() {},
            focus() { view.element.focus?.() },
            destroy() {
              if (instanceDestroyed) return
              instanceDestroyed = true
              try { releaseSubscription() }
              finally { view.destroy() }
            },
          }
        },
        destroy() { destroyed = true },
      }
    },
  })
}
