import { SheetConfig, ImpositionType, SheetOrientation, ReadingDirection, RowOffsetType, AlternateRotationType, JobInfoState, PrintColorType, PaperQuickType, FinishType, BindingType } from './types';

export const INCH_TO_POINTS = 72;
export const MM_TO_POINTS = INCH_TO_POINTS / 25.4;

export const DEFAULT_BLEED_INCHES = 0.125;
export const DEFAULT_HORIZONTAL_GUTTER_INCHES = 0;
export const DEFAULT_VERTICAL_GUTTER_INCHES = 0;
export const DEFAULT_CREEP_INCHES = 0;

export const CROP_MARK_LENGTH_POINTS = 18;
export const CROP_MARK_OFFSET_POINTS = 9;
export const CROP_MARK_THICKNESS_POINTS = 0.5;

export const SHEET_SIZES: SheetConfig[] = [
  { name: "11 x 17 Paper", longSideInches: 17, shortSideInches: 11 },
  { name: "12 x 18 Paper", longSideInches: 18, shortSideInches: 12 },
  { name: "12.5 x 19 Paper", longSideInches: 19, shortSideInches: 12.5 },
  { name: "13 x 19 Paper", longSideInches: 19, shortSideInches: 13 },
];

export const IMPOSITION_TYPE_OPTIONS: { value: ImpositionType; label: string }[] = [
  { value: 'stack', label: 'Stack' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'collateCut', label: 'Collate & Cut' },
  { value: 'booklet', label: 'Booklet' },
];

export const SHEET_ORIENTATION_OPTIONS: { value: SheetOrientation; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

export const READING_DIRECTION_OPTIONS: { value: ReadingDirection; label: string }[] = [
  { value: 'ltr', label: 'Left-to-Right' },
  { value: 'rtl', label: 'Right-to-Left' },
];

export const ROW_OFFSET_OPTIONS: { value: RowOffsetType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'half', label: 'Stagger by 50%' },
];

export const ALTERNATE_ROTATION_OPTIONS: { value: AlternateRotationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'altCol', label: 'Alternate Columns' },
  { value: 'altRow', label: 'Alternate Rows' },
];

export const SLUG_AREA_MARGIN_POINTS = 9;
export const QR_CODE_SIZE_POINTS = 57;
export const SLUG_TEXT_FONT_SIZE_POINTS = 7;
export const SLUG_TEXT_QR_PADDING_POINTS = 7;
export const SLUG_AREA_BOTTOM_Y_POINTS = 8.5;
export const QR_GENERATION_PIXEL_SIZE = 236;
export const QR_SLUG_SHIFT_RIGHT_POINTS = 5.6;

export const SLIP_SHEET_COLORS = [
  { name: 'Grey', pdfRgb: [0.75, 0.75, 0.75], cssColor: 'rgba(191, 191, 191, 0.8)' },
  { name: 'Yellow', pdfRgb: [1, 1, 0.6], cssColor: 'rgba(255, 255, 153, 0.8)' },
  { name: 'Green', pdfRgb: [0.6, 1, 0.6], cssColor: 'rgba(153, 255, 153, 0.8)' },
  { name: 'Pink', pdfRgb: [1, 0.6, 0.6], cssColor: 'rgba(255, 153, 153, 0.8)' },
  { name: 'Blue', pdfRgb: [0.6, 0.6, 1], cssColor: 'rgba(153, 153, 255, 0.8)' },
] as const;

export const DEFAULT_JOB_INFO_STATE: JobInfoState = {
  jobIdName: '',
  customerName: '',
  contactInfo: '',
  fileNameTitle: '',
  quantity: '',
  dueDate: '',
  finalTrimWidth: '',
  finalTrimHeight: '',
  interiorPrintType: '',
  interiorPaperQuick: '',
  interiorPaperWeight: '',
  coverPrintType: 'cmyk',
  coverPaperQuick: 'coverstock',
  coverPaperWeight: '',
  finishType: '',
  bindingType: '',
  urgentNotes: '',
};
