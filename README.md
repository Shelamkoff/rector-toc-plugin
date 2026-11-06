# Rector TOC plugin

Automatic, nested and live-updating Table of Contents for [Rector v2](https://github.com/Shelamkoff/editor). Implemented as an external `toc` block plugin with a matching document renderer. Does not modify Rector core, history or the v2 JSON envelope.

## Features

- Builds a nested list of H2–H6 headings, including skipped levels, in document order.
- Live heading edits, inserts, moves, conversions, deletes and Undo/Redo; TOC updates are presentation-only (no extra history actions).
- Configurable title, heading range and numbered/bulleted mode, stored as versioned JSON.
- Anchors use stable block IDs rather than title-derived slugs, so renaming headings preserves links.
- Safe plain-text labels (no untrusted HTML injection), optional inline-widget text resolver.
- Complete HTML5 entity decoding (using the pinned `entities` dependency); literal escaped inline tokens remain literal.
- Per-editor source lifecycle, cancellable subscriptions, custom navigation and separate renderer.

## Install

~~~sh
npm install @shelamkoff/rector @shelamkoff/rector-toc-plugin
~~~

**Requires Rector v2.** The package remains unpublished until an npm release is performed; it can be installed from its Git repository in the meantime. `@shelamkoff/rector` is a peer dependency. Styles are automatically injected when used as a registered Rector plugin/renderer, or set `injectStyles: false` and import `@shelamkoff/rector-toc-plugin/styles.css` yourself.

## Editor usage

~~~js
import { createEditor } from '@shelamkoff/rector'
import { createHeadingPlugin } from '@shelamkoff/rector/plugins/heading'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'
import { createTocPlugin, createTocSource } from '@shelamkoff/rector-toc-plugin'

// One TOC source for EACH editor. Create and bind it before inserting a TOC block.
const source = createTocSource({
  inlineToText(widget) {
    if (widget.type === 'mention') return widget.data.name
    if (widget.type === 'color') return widget.data.value
    return null
  },
})
const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createParagraphPlugin(), createHeadingPlugin(), createTocPlugin({ source })],
})
const unbind = source.bindEditor(editor)

// Calling these at app disposal is safe, even when the editor was already destroyed:
function destroyEditor() {
  unbind()
  editor.destroy()
  source.destroy()
}
~~~

Use Rector's block insertion menu or `editor.blocks.insert({ type: 'toc' })`. Its settings panel edits the title, minimum/maximum heading levels and list numbering. The default source doesn't see document content until you call `source.bindEditor(editor)`; this is intentional because the Rector block runtime exposes only per-block data. No access to private core classes is required.

## Document rendering

~~~js
import { EditorRenderer } from '@shelamkoff/rector/renderer'
import {
  createTocSource, createTocRenderer, renderTocDocument,
} from '@shelamkoff/rector-toc-plugin'

const source = createTocSource()
const renderer = new EditorRenderer()
renderer.registerRenderer(createTocRenderer({ source }))
renderTocDocument(renderer, savedDocument, document.querySelector('#article'), { source })
// For a new document: call renderTocDocument again. Stable renderer block IDs
// are reused while the live TOC source updates its presentation separately.

// On disposal:
renderer.destroy()
source.destroy()
~~~

`renderTocDocument()` calls `source.setDocument()`, renders the current v2 document and assigns stable IDs to rendered heading elements. If you use `renderer.render()` or `renderer.renderTo()` directly, call `applyTocAnchors(container)` afterward. For multiple documents in one page supply a distinct ASCII `anchorPrefix` to the TOC plugin/renderer and anchor function. The renderer is browser-DOM based; a server-side HTML renderer should use `collectTocHeadings()` and `tocAnchorId()` to produce the same markup. No server-side DOM or API credentials are required by this package.

## Canonical JSON

~~~json
{
  "id": "toc-1",
  "type": "toc",
  "dataVersion": 1,
  "data": {
    "title": "Contents",
    "minLevel": 2,
    "maxLevel": 4,
    "numbered": false
  }
}
~~~

Entries are *derived* from `heading` blocks. Only appearance options are persisted; heading IDs, titles and levels are not duplicated into TOC block data. An empty title hides the visual title. H1 is intentionally excluded because Rector's native Heading supports H2–H6.

## Runtime/source contract

`createTocSource({ document?, inlineToText?, textFromBlock?, onError? })` exposes `getHeadings()`, `setDocument(data)`, `subscribe(listener)`, `bindEditor(editor)` and `destroy()`. `bindEditor()` uses only `save()` and `transaction:committed`/`editor:destroyed`, so the TOC follows all canonical document mutations. It reads only when a relevant heading or document-order change was committed and isolates observer exceptions. For custom heading types, use your own source implementing `getHeadings()` / `subscribe()`.

If a custom source or navigation callback executes network operations, the application owns authorization, request cancellation and error handling. This plugin never fetches URLs, writes user-supplied HTML or creates new document transactions for heading updates.

## Development

Install the pinned HTML5 decoder before running tests in a source checkout. The
Rector v2 peer dependency is provided separately by the host application.

~~~sh
npm install --no-audit --no-fund --legacy-peer-deps
npm test
npm pack --dry-run
~~~


Tests cover schema/version handling, heading extraction and entity escaping, nesting, stable anchors, source subscriptions/event filtering, block/renderer lifecycle and settings. See `test/`.
