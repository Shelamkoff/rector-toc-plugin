import type {
  BlockPluginDefinition, EditorOutputData, IEditor,
  EditorBlockData, InlinePluginDefinition,
} from '@shelamkoff/rector/types'
import type { BlockRendererDefinition } from '@shelamkoff/rector/renderer/types'

export declare const TOC_TYPE: 'toc'
export interface TocData {
  title: string
  minLevel: number
  maxLevel: number
  numbered: boolean
}
export interface TocHeading {
  readonly id: string
  readonly level: number
  readonly text: string
}
export interface TocTreeNode extends TocHeading {
  readonly children: TocTreeNode[]
}
export declare const DEFAULT_TOC_DATA: Readonly<TocData>
export declare const tocSchema: {
  readonly currentVersion: 1
  createDefault(): TocData
  decode(input: { dataVersion: number, data: unknown }): { dataVersion: 1, data: TocData }
  encode(data: Readonly<TocData>): { dataVersion: 1, data: TocData }
}
export declare function normalizeTocData(value: Partial<TocData>): TocData
export declare function htmlToText(html: string): string
export type TocBlock = EditorBlockData<'heading', { text: string, level: number }>
export interface TocExtractionOptions {
  /** Pass the same inline definitions used by Rector createEditor(). */
  inlinePlugins?: readonly InlinePluginDefinition[]
  inlineToText?: (widget: unknown, block: TocBlock) => string | null | undefined
  textFromBlock?: (block: TocBlock) => string
}
export declare function collectTocHeadings(documentData: EditorOutputData, options?: TocExtractionOptions): readonly TocHeading[]
export declare function buildTocTree(headings: readonly TocHeading[], data?: TocData): TocTreeNode[]
export declare function tocAnchorId(blockId: string, prefix?: string): string
export interface TocSource {
  getHeadings(): readonly TocHeading[]
  setDocument(documentData: EditorOutputData): void
  bindEditor(editor: IEditor): () => void
  subscribe(callback: (headings: readonly TocHeading[]) => void): () => void
  destroy(): void
}
export declare function createTocSource(options?: TocExtractionOptions & {
  document?: EditorOutputData
  onError?: (error: unknown) => void
}): TocSource
export interface TocOptions {
  source: Pick<TocSource, 'getHeadings' | 'subscribe'>
  anchorPrefix?: string
  navigate?: (blockId: string, context: { event: MouseEvent, nav: HTMLElement }) => boolean | void
  injectStyles?: boolean
  css?: string
}
export declare function createTocPlugin(options: TocOptions): BlockPluginDefinition<TocData>
export declare function createTocRenderer(options: TocOptions): BlockRendererDefinition<EditorBlockData<'toc', TocData>>
export declare function applyTocAnchors(container: Element, options?: { anchorPrefix?: string }): number
export declare function renderTocDocument(
  renderer: { renderTo(data: EditorOutputData, container: HTMLElement): void },
  documentData: EditorOutputData,
  container: HTMLElement,
  options: { source: Pick<TocSource, 'setDocument'>, anchorPrefix?: string },
): void
