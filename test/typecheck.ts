import {
  createTocSource, createTocPlugin, createTocRenderer,
  tocSchema, collectTocHeadings, renderTocDocument,
  type TocData, type TocSource, type TocHeading,
} from '../src/index.js'
import type { EditorOutputData, BlockPluginDefinition, InlinePluginDefinition } from '@shelamkoff/rector/types'
import type { BlockRendererDefinition } from '@shelamkoff/rector/renderer/types'

const source: TocSource = createTocSource()
const options: TocData = tocSchema.createDefault()
const plugin: BlockPluginDefinition<TocData> = createTocPlugin({ source })
const renderer: BlockRendererDefinition = createTocRenderer({ source })
const documentData: EditorOutputData = { version: '2.0.0', blocks: [] }
const headings: readonly TocHeading[] = collectTocHeadings(documentData)
const saved: Readonly<TocData> = tocSchema.decode({ dataVersion: 1, data: options }).data
const inlineDefinitions: readonly InlinePluginDefinition[] = []
const sourceWithInlineDefinitions: TocSource = createTocSource({ inlinePlugins: inlineDefinitions })
const derived = collectTocHeadings(documentData, { inlinePlugins: inlineDefinitions })
void [plugin, renderer, headings, saved, sourceWithInlineDefinitions, derived]
void renderTocDocument
