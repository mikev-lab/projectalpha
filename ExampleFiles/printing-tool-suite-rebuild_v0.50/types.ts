// These are simplified type definitions for the parts of pdf-lib used via UMD global.
// For a full typed experience, you'd typically install pdf-lib as a module.

import { 
  INTERIOR_PAPER_TYPES_OPTIONS, INTERIOR_PAPER_WEIGHT_OPTIONS, 
  COVER_PAPER_TYPE_OPTIONS, COVER_PAPER_WEIGHT_OPTIONS, SLIP_SHEET_COLORS
} from './constants';


export interface PDFLib {
  PDFDocument: PDFDocumentStatic;
  rgb: (r: number, g: number, b: number) => RGB;
  cmyk: (c: number, m: number, y: number, k: number) => CMYK;
  degrees: (angle: number) => number;
  StandardFonts: { // Enum of standard font names
    Courier: string;
    CourierBold: string;
    CourierOblique: string;
    CourierBoldOblique: string;
    Helvetica: string;
    HelveticaBold: string;
    HelveticaOblique: string;
    HelveticaBoldOblique: string;
    TimesRoman: string;
    TimesRomanBold: string;
    TimesRomanOblique: string;
    TimesRomanBoldOblique: string;
    Symbol: string;
    ZapfDingbats: string;
  };
  // Add other pdf-lib exports as needed
}

export interface PDFDocumentStatic {
  create: () => Promise<PDFDocument>;
  load: (pdfBytes: ArrayBuffer | Uint8Array) => Promise<PDFDocument>;
}

export interface PDFImage {
  // Represents an embedded image in pdf-lib
  // Actual properties might vary, this is a simplified representation
  width: number;
  height: number;
  ref: unknown; // Internal reference
}

export interface PDFDocument {
  addPage: (size?: [number, number] | PDFPage) => PDFPage;
  embedPage: (page: PDFPage, clipBox?: Box) => Promise<PDFEmbeddedPage>;
  embedPages: (pages: PDFPage[], clipBoxes?: Box[]) => Promise<PDFEmbeddedPage[]>;
  getPages: () => PDFPage[];
  getPageCount: () => number;
  save: (options?: { useObjectStreams?: boolean }) => Promise<Uint8Array>;
  setTitle: (title: string) => void;
  embedFont: (font: string) => Promise<PDFFont>; // StandardFonts string or custom
  embedPng: (pngBytes: ArrayBuffer | Uint8Array) => Promise<PDFImage>;
  embedJpg: (jpgBytes: ArrayBuffer | Uint8Array) => Promise<PDFImage>;
}

export interface PDFFont {
  // Simplified, actual structure is more complex
  encodeText: (text: string) => Uint8Array;
  widthOfTextAtSize: (text: string, size: number) => number;
  heightAtSize: (size: number, options?: { descender?: boolean }) => number;
}


export interface PDFPage {
  drawPage: (embeddedPage: PDFEmbeddedPage, options?: DrawPageOptions) => void;
  drawLine: (options: DrawLineOptions) => void;
  drawText: (text: string, options?: DrawTextOptions) => void;
  drawRectangle: (options?: DrawRectangleOptions) => void;
  drawImage: (image: PDFImage, options?: DrawImageOptions) => void;
  getSize: () => Size;
  getTrimBox: () => Box; // Assuming TrimBox is available and what we want
  getWidth: () => number;
  getHeight: () => number;
  // Add other PDFPage methods as needed
}

export interface PDFEmbeddedPage {
  width: number;
  height: number;
  // Add other PDFEmbeddedPage properties as needed
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface RGB {
  // Internal structure, not typically directly manipulated
  readonly type: 'RGB';
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}
export interface CMYK {
  // Internal structure
  readonly type: 'CMYK';
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
}


export interface DrawPageOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotate?: { angle: number; type: 'degrees' };
  xSkew?: { angle: number; type: 'degrees' };
  ySkew?: { angle: number; type: 'degrees' };
  // Add other options as needed
}

export interface DrawLineOptions {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness?: number;
  color?: RGB | CMYK;
  opacity?: number;
  lineCap?: 'butt' | 'round' | 'square';
}

export interface DrawTextOptions {
  x?: number;
  y?: number;
  font?: PDFFont;
  size?: number;
  color?: RGB | CMYK;
  opacity?: number;
  rotate?: { angle: number; type: 'degrees' };
  // Add other text options
}

export interface DrawRectangleOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: RGB | CMYK;
  borderColor?: RGB | CMYK;
  borderWidth?: number;
  opacity?: number;
  borderOpacity?: number;
  rotate?: { angle: number; type: 'degrees' };
  borderDashArray?: number[];
  borderDashPhase?: number;
}

export interface DrawImageOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotate?: { angle: number; type: 'degrees' };
  xSkew?: { angle: number; type: 'degrees' };
  ySkew?: { angle: number; type: 'degrees' };
  opacity?: number;
}


// App-specific types
export interface SheetConfig {
  name: string; // e.g., "11 x 17 Paper"
  longSideInches: number;
  shortSideInches: number;
}

export type ImpositionType = 'stack' | 'repeat' | 'collateCut' | 'booklet';

export type SheetOrientation = 'auto' | 'portrait' | 'landscape';

export type ReadingDirection = 'ltr' | 'rtl';

export type RowOffsetType = 'none' | 'half';

export type AlternateRotationType = 'none' | 'altCol' | 'altRow';

// Job Information Form Types
export type PrintColorType = 'bw' | 'cmyk' | '';
export type PaperQuickType = 'uncoated' | 'coated' | 'coverstock' | '';
export type FinishType = 'none' | 'glosslam' | 'mattelam' | '';
export type BindingType = 'perfect' | 'saddle' | 'spiral' | '';

export interface JobInfoState {
  jobIdName: string;
  customerName: string;
  contactInfo: string;
  fileNameTitle: string; 
  quantity: string; // Use string to allow empty input
  dueDate: string;
  finalTrimWidth: string;
  finalTrimHeight: string;
  interiorPrintType: PrintColorType;
  interiorPaperQuick: PaperQuickType;
  interiorPaperWeight: string;
  coverPrintType: PrintColorType;
  coverPaperQuick: PaperQuickType;
  coverPaperWeight: string;
  finishType: FinishType;
  bindingType: BindingType;
  urgentNotes: string;
}

export type SlipSheetColorName = typeof SLIP_SHEET_COLORS[number]['name'];

// For usePdfImposition hook
export interface ImpositionParams {
  inputFile: File | null;
  selectedSheet: SheetConfig;
  columns: number;
  rows: number;
  bleedInches: number;
  horizontalGutterInches: number;
  verticalGutterInches: number;
  impositionType: ImpositionType;
  sheetOrientation: SheetOrientation;
  clientName: string; // Legacy client name from simpler input
  includeInfo: boolean;
  isDuplex: boolean;
  jobInfo: JobInfoState; // Detailed job information
  addFirstSheetSlip: boolean; 
  firstSheetSlipColor: SlipSheetColorName;
  readingDirection: ReadingDirection;
  showSpineMarks: boolean;
  rowOffsetType: RowOffsetType;
  alternateRotationType: AlternateRotationType;
  creepInches: number;
  isLargeFile?: boolean;
}

export type ImpositionSettings = Omit<ImpositionParams, 'inputFile' | 'clientName' | 'jobInfo' | 'selectedSheet'> & {
  selectedSheetName: string;
};

export interface ImpositionPreset extends ImpositionSettings {
  name: string;
}


// QR Code library (assuming qrcode.js or qrious, loaded globally)
// Using qrious as per updated index.html
interface QRiousOptions {
  background?: string; // Background color. (Default: white)
  backgroundAlpha?: number; // Background alpha. (Default: 1.0)
  foreground?: string; // Foreground color. (Default: black)
  foregroundAlpha?: number; // Foreground alpha. (Default: 1.0)
  level?: 'L' | 'M' | 'Q' | 'H'; // Error correction level. (Default: L)
  mime?: string; // Mime type for Cavas.toDataURL. (Default: image/png)
  padding?: number | null; // Padding. (Default: null)
  size?: number; // QR Code size in pixels.
  value: string; // The value to encode.
  element?: HTMLCanvasElement; // The canvas element to draw on.
}
export interface QRiousStatic {
  new (options: QRiousOptions): QRiousInstance;
}
export interface QRiousInstance {
  // Properties and methods of a QRious instance.
  // For example, if it directly modifies the passed canvas or has a toDataURL method.
  toDataURL: (mime?: string) => string;
  set: (options: Partial<QRiousOptions>) => void;
  readonly canvas: HTMLCanvasElement; // The canvas element
}

// pdf.js types (simplified)
export interface PDFJSViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  transform: number[];
  clone(options: { scale?: number; rotation?: number; dontFlip?: boolean }): PDFJSViewport;
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
}

export interface PDFJSPageProxy {
  pageNumber: number;
  getViewport(params: { scale: number; rotation?: number }): PDFJSViewport;
  render(params: RenderParameters): RenderTask;
  // Add other methods/properties as needed
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFJSPageProxy>;
  // Add other methods/properties as needed
  destroy(): void;
}

export interface RenderParameters {
  canvasContext: CanvasRenderingContext2D;
  viewport: PDFJSViewport;
  transform?: number[];
  background?: string;
  // Add other render options as needed
}

export interface RenderTask {
  promise: Promise<void>;
  cancel(): void;
  // Add other properties as needed
}

export interface GetDocumentParameters {
  url?: string;
  data?: Uint8Array | ArrayBuffer | string; // Base64 string, Uint8Array, or URL
  // Add other options like password, CMapUrl, etc.
}

export interface PDFJSLib {
  getDocument(src: GetDocumentParameters | string | ArrayBuffer | Uint8Array): { promise: Promise<PDFDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
  // Add other pdfjsLib exports as needed
}


declare global {
  interface Window {
    PDFLib?: PDFLib;
    QRious?: QRiousStatic; // Using QRious from CDN
    pdfjsLib?: PDFJSLib; // For pdf.js
  }
}

// Types for Book Spine Calculator
export type InteriorPaperTypeKey = typeof INTERIOR_PAPER_TYPES_OPTIONS[number]['value'];
export type InteriorPaperWeightKey = typeof INTERIOR_PAPER_WEIGHT_OPTIONS[number]['value'];
export type CoverPaperTypeKey = typeof COVER_PAPER_TYPE_OPTIONS[number]['value'];
export type CoverPaperWeightKey = typeof COVER_PAPER_WEIGHT_OPTIONS[number]['value'];

// Types for Proofing Tool
export type BindingTypeProofing = 'saddleStitch' | 'perfectBound';