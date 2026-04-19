import type { MixFileInfo } from '../MixParser'
import type { ResourceContext } from '../gameRes/ResourceContext'
import type { PaletteSelectionInfo } from '../palette/PaletteTypes'
import type { PreviewTarget } from '../../components/preview/types'

export type MixFileData = { file: File; info: MixFileInfo }

export interface ExportContext {
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
  /**
   * 由调用方（MixEditor）从预览侧透传的当前选中目标。
   * 如果有：ShpExportRenderer.loadShpAsset 优先用 resolvePreviewFile 取字节，
   * 自动支持 project-file / mix-entry / base-mix-entry 三种来源。
   * 不传：回退现有 splitSelectedFilePath + MixParser.extractFile（base 模式行为）。
   */
  previewTarget?: PreviewTarget | null
}

export interface ResolvedSelectedFile {
  selectedFile: string
  mixName: string
  innerPath: string
  filename: string
  extension: string
  mixFile: File
}

export type ExportAssociationKind = 'pal' | 'hva'

export interface ExportAssociation {
  kind: ExportAssociationKind
  path: string
  filename: string
  reason: string
}

export type RawAssociationExportMode = 'separate' | 'zip'

export interface RawExportOptions {
  includeAssociations: boolean
  associationMode: RawAssociationExportMode
  confirmAssociationExport?: (associationCount: number) => Promise<boolean>
}

export interface RawExportResult {
  mainFilePath: string
  associationPaths: string[]
  mode: 'single' | RawAssociationExportMode
}

export type FrameMode = 'single' | 'range'
export type SheetLayout = 'grid' | 'single-column'
export type StaticImageFormat = 'png' | 'jpg'
export type TransparencyMode = 'index' | 'opaque'
export type PaletteMode = 'auto' | 'manual'

export interface PaletteOptions {
  mode: PaletteMode
  manualPalettePath: string
}

export interface FrameRangeOptions {
  mode: FrameMode
  frameIndex: number
  startFrame: number
  endFrame: number
}

export interface ShpTransparencyOptions {
  mode: TransparencyMode
  transparentIndex: number
  backgroundColor: string
}

export interface ShpStaticExportOptions {
  format: StaticImageFormat
  frameRange: FrameRangeOptions
  layout: SheetLayout
  gridColumns: number
  palette: PaletteOptions
  transparency: ShpTransparencyOptions
  jpegQuality: number
}

export interface ShpGifExportOptions {
  frameRange: FrameRangeOptions
  palette: PaletteOptions
  transparency: ShpTransparencyOptions
  frameDelayMs: number
  loopCount: number
}

export interface LoadedShpPalette {
  palettePath: string | null
  paletteSelection: PaletteSelectionInfo
}

export interface ShpFrameGeometry {
  width: number
  height: number
  frames: number
}

