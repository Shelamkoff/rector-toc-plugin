import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createEditor } from '@shelamkoff/rector'
import { EditorRenderer } from '@shelamkoff/rector/renderer'
import {
  createTocPlugin, createTocRenderer, createTocSource,
  collectTocHeadings, tocAnchorId,
} from '@shelamkoff/rector-toc-plugin'

assert.equal(typeof createEditor, 'function')
assert.equal(typeof EditorRenderer, 'function')
assert.equal(typeof tocAnchorId, 'function')
const documentData = {
  version: '2.0.0',
  blocks: [{ id: 'h', type: 'heading', dataVersion: 2, data: { text: 'Packed works', level: 2 } }],
}
const source = createTocSource({ document: documentData })
assert.deepEqual(collectTocHeadings(documentData).map(x => x.text), ['Packed works'])
const plugin = createTocPlugin({ source, injectStyles: false })
const renderer = createTocRenderer({ source, injectStyles: false })
assert.equal(plugin.type, renderer.type)
assert.equal(plugin.schema.currentVersion, renderer.schema.currentVersion)
await stat(fileURLToPath(import.meta.resolve('@shelamkoff/rector-toc-plugin/styles.css')))
source.destroy()
console.log('packed consumer: runtime exports and style path are valid')
