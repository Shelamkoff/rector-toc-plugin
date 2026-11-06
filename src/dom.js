import { buildTocTree, normalizeTocData, tocAnchorId } from './model.js'

function findHeadingInScope(nav, id) {
  const scope = nav.closest?.('.oe-editor') ?? nav.parentElement
  if (!scope?.querySelectorAll) return null
  for (const element of scope.querySelectorAll('[data-block-type="heading"][data-block-id]')) {
    if (element.dataset.blockId === id) return element
  }
  return null
}

export function createTocView(document, { anchorPrefix, navigate } = {}) {
  const nav = document.createElement('nav')
  nav.className = 'rector-toc'
  nav.contentEditable = 'false'
  const handleClick = event => {
    const target = event.target?.closest?.('a[data-toc-target]')
    if (!target || !nav.contains(target)) return
    const blockId = target.dataset.tocTarget
    if (typeof navigate === 'function') {
      const handled = navigate(blockId, { event, nav })
      if (handled !== false) event.preventDefault()
      return
    }
    // The editor owns heading wrappers, which intentionally lack HTML IDs.
    // The standalone renderer can add permanent fragment IDs separately.
    const heading = findHeadingInScope(nav, blockId)
    if (heading && heading.id !== tocAnchorId(blockId, anchorPrefix)) {
      event.preventDefault()
      heading.scrollIntoView?.({ block: 'start' })
    }
  }
  nav.addEventListener('click', handleClick)

  const render = (data, headings) => {
    const config = normalizeTocData(data)
    nav.replaceChildren()
    nav.setAttribute('aria-label', config.title || 'Table of contents')
    if (config.title) {
      const title = document.createElement('div')
      title.className = 'rector-toc__title'
      title.textContent = config.title
      nav.appendChild(title)
    }
    const roots = buildTocTree(headings, config)
    if (!roots.length) {
      const empty = document.createElement('p')
      empty.className = 'rector-toc__empty'
      empty.textContent = 'No headings'
      nav.appendChild(empty)
      return
    }
    const appendList = (parent, nodes) => {
      const list = document.createElement(config.numbered ? 'ol' : 'ul')
      list.className = 'rector-toc__list'
      for (const node of nodes) {
        const item = document.createElement('li')
        item.className = 'rector-toc__item'
        item.dataset.headingLevel = String(node.level)
        const link = document.createElement('a')
        link.className = 'rector-toc__link'
        link.dataset.tocTarget = node.id
        link.setAttribute('href', '#' + tocAnchorId(node.id, anchorPrefix))
        link.textContent = node.text
        item.appendChild(link)
        if (node.children.length) appendList(item, node.children)
        list.appendChild(item)
      }
      parent.appendChild(list)
    }
    appendList(nav, roots)
  }

  return { element: nav, render, destroy() { nav.removeEventListener('click', handleClick) } }
}

/** Add permanent fragment targets after EditorRenderer.renderTo or render(). */
export function applyTocAnchors(container, { anchorPrefix } = {}) {
  if (!container || typeof container.querySelectorAll !== 'function') {
    throw new TypeError('applyTocAnchors requires an element container')
  }
  let count = 0
  for (const heading of container.querySelectorAll('[data-block-type="heading"][data-block-id]')) {
    heading.id = tocAnchorId(heading.dataset.blockId, anchorPrefix)
    count++
  }
  return count
}
