export interface SheetConfig {
  name: string;
  longSideInches: number;
  shortSideInches: number;
}

export type ImpositionType = 'stack' | 'repeat' | 'collateCut' | 'booklet';
export type SheetOrientation = 'auto' | 'portrait' | 'landscape';
export type ReadingDirection = 'ltr' | 'rtl';
export type RowOffsetType = 'none' | 'half';
export type AlternateRotationType = 'none' | 'altCol' | 'altRow';

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
  clientName: string;
  includeInfo: boolean;
  isDuplex: boolean;
  jobInfo: JobInfoState;
  addFirstSheetSlip: boolean;
  firstSheetSlipColor: SlipSheetColorName;
  readingDirection: ReadingDirection;
  showSpineMarks: boolean;
  rowOffsetType: RowOffsetType;
  alternateRotationType: AlternateRotationType;
  creepInches: number;
  isLargeFile: boolean;
}

export interface JobInfoState {
  jobIdName: string;
  customerName: string;
  contactInfo: string;
  fileNameTitle: string;
  quantity: string;
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

export type PrintColorType = '' | 'bw' | 'cmyk';
export type PaperQuickType = '' | 'uncoated' | 'coated' | 'coverstock';
export type FinishType = '' | 'none' | 'glosslam' | 'mattelam';
export type BindingType = '' | 'perfect' | 'saddle' | 'spiral';
export type BindingTypeProofing = 'perfectBound' | 'saddleStitch';

export const SLIP_SHEET_COLORS: readonly { readonly name: "Grey"; readonly pdfRgb: readonly [number, number, number]; readonly cssColor: "rgba(191, 191, 191, 0.8)"; }[];
export type SlipSheetColorName = typeof SLIP_SHEET_COLORS[number]['name'];
