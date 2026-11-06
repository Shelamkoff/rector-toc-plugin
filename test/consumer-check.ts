import { createTocPlugin, createTocSource, type TocData } from '@shelamkoff/rector-toc-plugin'
import type { BlockPluginDefinition, EditorOutputData } from '@shelamkoff/rector/types'
const source = createTocSource()
const definition: BlockPluginDefinition<TocData> = createTocPlugin({ source })
const document: EditorOutputData = { version: '2.0.0', blocks: [] }
void [definition, document]
