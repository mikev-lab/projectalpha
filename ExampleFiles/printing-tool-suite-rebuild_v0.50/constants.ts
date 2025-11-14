import { SheetConfig, ImpositionType, SheetOrientation, InteriorPaperTypeKey, InteriorPaperWeightKey, CoverPaperTypeKey, CoverPaperWeightKey, JobInfoState, PrintColorType, PaperQuickType, FinishType, BindingType, BindingTypeProofing, ReadingDirection, RowOffsetType, AlternateRotationType } from './types';

export const INCH_TO_POINTS = 72;
export const MM_TO_POINTS = INCH_TO_POINTS / 25.4;

export const DEFAULT_BLEED_INCHES = 0.125;
export const DEFAULT_HORIZONTAL_GUTTER_INCHES = 0;
export const DEFAULT_VERTICAL_GUTTER_INCHES = 0;
export const DEFAULT_SAFETY_MARGIN_INCHES = 0.125; 
export const DEFAULT_CREEP_INCHES = 0;

// --- Unit Conversion ---
export const INCH_TO_MM = 25.4;
export const MM_TO_INCH = 1 / INCH_TO_MM;


export const CROP_MARK_LENGTH_POINTS = 18; // 0.25 inches
export const CROP_MARK_OFFSET_POINTS = 9;  // 0.125 inches from trim edge
export const CROP_MARK_THICKNESS_POINTS = 0.5;

export const SHEET_SIZES: SheetConfig[] = [
  { 
    name: "11 x 17 Paper", 
    longSideInches: 17, 
    shortSideInches: 11, 
  },
  { 
    name: "12 x 18 Paper", 
    longSideInches: 18, 
    shortSideInches: 12, 
  },
  { 
    name: "12.5 x 19 Paper", 
    longSideInches: 19, 
    shortSideInches: 12.5, 
  },
  { 
    name: "13 x 19 Paper", 
    longSideInches: 19, 
    shortSideInches: 13, 
  },
];

export const IMPOSITION_TYPE_OPTIONS: { value: ImpositionType; label: string }[] = [
    { value: 'stack', label: 'Stack (e.g., P1,P2 on S1; P3,P4 on S2)' },
    { value: 'repeat', label: 'Repeat (e.g., P1,P1 on S1; P2,P2 on S2)' },
    { value: 'collateCut', label: 'Collate & Cut (for stacks)' },
    { value: 'booklet', label: 'Booklet (Saddle Stitch)' },
];

export const SHEET_ORIENTATION_OPTIONS: { value: SheetOrientation; label: string }[] = [
  { value: 'auto', label: 'Auto-detect Orientation' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

export const READING_DIRECTION_OPTIONS: { value: ReadingDirection; label: string }[] = [
    { value: 'ltr', label: 'Left-to-Right (LTR)' },
    { value: 'rtl', label: 'Right-to-Left (RTL)' },
];

export const ROW_OFFSET_OPTIONS: { value: RowOffsetType; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'half', label: 'Stagger by 50%' },
];

export const ALTERNATE_ROTATION_OPTIONS: { value: AlternateRotationType; label: string }[] = [
    { value: 'none', label: 'None (Head to Foot)' },
    { value: 'altCol', label: 'Alternate Columns (Head to Head)' },
    { value: 'altRow', label: 'Alternate Rows (Head to Head)' },
];

export const DEFAULT_COLUMNS: number = 1;
export const DEFAULT_ROWS: number = 1;
export const DEFAULT_SHEET_SIZE_NAME: string = SHEET_SIZES[0].name;
export const DEFAULT_IMPOSITION_TYPE: ImpositionType = 'stack';
export const DEFAULT_SHEET_ORIENTATION: SheetOrientation = 'auto';
export const DEFAULT_READING_DIRECTION: ReadingDirection = 'ltr';
export const DEFAULT_ROW_OFFSET_TYPE: RowOffsetType = 'none';
export const DEFAULT_ALTERNATE_ROTATION_TYPE: AlternateRotationType = 'none';
export const DEFAULT_CLIENT_NAME: string = ""; // Legacy client name
export const DEFAULT_INCLUDE_INFO: boolean = false;
export const DEFAULT_IS_DUPLEX: boolean = false;
export const DEFAULT_ADD_FIRST_SHEET_SLIP: boolean = false; 
export const DEFAULT_SHOW_SPINE_MARKS: boolean = false;


// For PdfPreview component when no input PDF is loaded (e.g., 8.5 x 11 inches)
export const DEFAULT_PREVIEW_PAGE_WIDTH_POINTS = 8.5 * INCH_TO_POINTS;
export const DEFAULT_PREVIEW_PAGE_HEIGHT_POINTS = 11 * INCH_TO_POINTS;
export const DEFAULT_PREVIEW_PAGE_COUNT = 4; // For preview total sheets calculation

// Slug area constants
const QR_TARGET_SIZE_CM = 2;
const CM_TO_INCHES = 1 / 2.54;
const QR_TARGET_SIZE_INCHES = QR_TARGET_SIZE_CM * CM_TO_INCHES; // Approx 0.7874 inches
const QR_TARGET_DPI = 300;

export const QR_CODE_SIZE_POINTS = QR_TARGET_SIZE_INCHES * INCH_TO_POINTS; // Approx 56.69 points
export const QR_GENERATION_PIXEL_SIZE = Math.round(QR_TARGET_SIZE_INCHES * QR_TARGET_DPI); // Approx 236 pixels

export const SLUG_AREA_MARGIN_POINTS = 9; // Margin from page edge for slug elements (left/right)
export const SLUG_TEXT_FONT_SIZE_POINTS = 7;
export const SLUG_TEXT_QR_PADDING_POINTS = 7; 
export const SLUG_AREA_BOTTOM_Y_POINTS = QR_CODE_SIZE_POINTS * 0.15; 

export const QR_SLUG_SHIFT_RIGHT_MM = 2;
export const QR_SLUG_SHIFT_RIGHT_POINTS = QR_SLUG_SHIFT_RIGHT_MM * MM_TO_POINTS;

// Slip Sheet Constants
export const SLIP_SHEET_COLORS = [
  { name: 'Grey', pdfRgb: [0.75, 0.75, 0.75], cssColor: 'rgba(191, 191, 191, 0.8)' },
  { name: 'Yellow', pdfRgb: [1, 1, 0.6], cssColor: 'rgba(255, 255, 153, 0.8)' },
  { name: 'Green', pdfRgb: [0.6, 1, 0.6], cssColor: 'rgba(153, 255, 153, 0.8)' },
  { name: 'Pink', pdfRgb: [1, 0.6, 0.6], cssColor: 'rgba(255, 153, 153, 0.8)' },
  { name: 'Blue', pdfRgb: [0.6, 0.6, 1], cssColor: 'rgba(153, 153, 255, 0.8)' },
] as const;

export const DEFAULT_SLIP_SHEET_COLOR_NAME: typeof SLIP_SHEET_COLORS[number]['name'] = 'Grey';


// --- Book Spine Calculator Constants ---
export const INTERIOR_PAPER_TYPES_OPTIONS = [
  { value: 'opaque', label: 'Opaque Text' },
  { value: 'gloss', label: 'Gloss Text' },
  { value: 'silk', label: 'Silk Text' },
] as const;

export const INTERIOR_PAPER_WEIGHT_OPTIONS = [
  { value: '60', label: '60# Text' },
  { value: '80', label: '80# Text' },
  { value: '100', label: '100# Text' },
] as const;

export const COVER_PAPER_TYPE_OPTIONS = [
  { value: 'silk', label: 'Silk Cover' },
  { value: 'gloss', label: 'Gloss Cover' },
] as const;

export const COVER_PAPER_WEIGHT_OPTIONS = [
  { value: '100', label: '100# Cover' },
  { value: '111', label: '111# Cover' },
  { value: '130', label: '130# Cover' },
] as const;

// PPI: Pages Per Inch (number of printed pages, not sheets, that make up one inch stack)
export const INTERIOR_PAPER_PPI: Record<InteriorPaperTypeKey, Record<InteriorPaperWeightKey, number>> = {
  opaque: {
    '60': 500, 
    '80': 400, 
    '100': 330,
  },
  gloss: {
    '60': 540,
    '80': 430,
    '100': 360,
  },
  silk: {
    '60': 530,
    '80': 420,
    '100': 350,
  },
};

// Caliper in inches (thickness of one sheet of cover stock)
export const COVER_PAPER_THICKNESS: Record<CoverPaperTypeKey, Record<CoverPaperWeightKey, number>> = {
  silk: {
    '100': 0.0095,
    '111': 0.0110,
    '130': 0.0135,
  },
  gloss: { 
    '100': 0.0090,
    '111': 0.0105,
    '130': 0.0130,
  },
};

export const DEFAULT_INTERIOR_PAPER_TYPE: InteriorPaperTypeKey = INTERIOR_PAPER_TYPES_OPTIONS[0].value;
export const DEFAULT_INTERIOR_PAPER_WEIGHT: InteriorPaperWeightKey = INTERIOR_PAPER_WEIGHT_OPTIONS[0].value;
export const DEFAULT_COVER_PAPER_TYPE: CoverPaperTypeKey = COVER_PAPER_TYPE_OPTIONS[0].value;
export const DEFAULT_COVER_PAPER_WEIGHT: CoverPaperWeightKey = COVER_PAPER_WEIGHT_OPTIONS[0].value;

export const DEFAULT_NUM_INTERIOR_PAGES = 96;
export const DEFAULT_FINISHED_BOOK_WIDTH_INCHES = 6;
export const DEFAULT_FINISHED_BOOK_HEIGHT_INCHES = 9;
export const DEFAULT_COVER_BLEED_INCHES = 0.125;


// --- Job Information Form Constants ---
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
  coverPrintType: 'cmyk', // Default cover to CMYK
  coverPaperQuick: 'coverstock', // Default cover to Cover Stock
  coverPaperWeight: '',
  finishType: '',
  bindingType: '',
  urgentNotes: '',
};

export const PRINT_COLOR_OPTIONS: { value: PrintColorType; label: string }[] = [
  { value: '', label: 'N/A' },
  { value: 'bw', label: 'B&W' },
  { value: 'cmyk', label: 'Color (CMYK)' },
];

export const INTERIOR_PAPER_QUICK_OPTIONS: { value: PaperQuickType; label: string }[] = [
  { value: '', label: 'N/A' },
  { value: 'uncoated', label: 'Uncoated' },
  { value: 'coated', label: 'Coated' },
];

export const COVER_PAPER_QUICK_OPTIONS: { value: PaperQuickType; label: string }[] = [
  { value: '', label: 'N/A' },
  { value: 'coverstock', label: 'Cover Stock' },
];

export const FINISH_TYPE_OPTIONS: { value: FinishType; label: string }[] = [
  { value: '', label: 'N/A' },
  { value: 'none', label: 'None' },
  { value: 'glosslam', label: 'Gloss Lamination' },
  { value: 'mattelam', label: 'Matte Lamination' },
];

export const BINDING_TYPE_OPTIONS: { value: BindingType; label: string }[] = [
  { value: '', label: 'N/A' },
  { value: 'perfect', label: 'Perfect Bound' },
  { value: 'saddle', label: 'Saddle Stitch' },
  { value: 'spiral', label: 'Spiral/Wire-O' },
];

// --- Box Label Printer Constants ---
export const LABEL_WIDTH_INCHES = 6;
export const LABEL_HEIGHT_INCHES = 4;
export const DEFAULT_COMPANY_NAME_FOR_LABEL = "Your Company Name";
export const LABEL_FONT_SIZES_PT = {
    header: 24,       // Customer Name
    subHeader: 18,    // Project Name / Job ID
    normal: 14,       // Quantity, Printed By, Contents, Date, Order ID
    small: 12,        // Smaller details if needed
};

// --- Proofing Tool: Standard Paper Sizes ---
export interface StandardPaperSize {
  name: string;
  width_mm: number;
  height_mm: number;
  group: string;
}

export const STANDARD_PAPER_SIZES: StandardPaperSize[] = [
  // ISO A Series
  { name: 'A0 (841 x 1189 mm)', width_mm: 841, height_mm: 1189, group: 'ISO A' },
  { name: 'A1 (594 x 841 mm)', width_mm: 594, height_mm: 841, group: 'ISO A' },
  { name: 'A2 (420 x 594 mm)', width_mm: 420, height_mm: 594, group: 'ISO A' },
  { name: 'A3 (297 x 420 mm)', width_mm: 297, height_mm: 420, group: 'ISO A' },
  { name: 'A4 (210 x 297 mm)', width_mm: 210, height_mm: 297, group: 'ISO A' },
  { name: 'A5 (148 x 210 mm)', width_mm: 148, height_mm: 210, group: 'ISO A' },
  { name: 'A6 (105 x 148 mm)', width_mm: 105, height_mm: 148, group: 'ISO A' },

  // ISO B Series
  { name: 'B0 (1000 x 1414 mm)', width_mm: 1000, height_mm: 1414, group: 'ISO B' },
  { name: 'B1 (707 x 1000 mm)', width_mm: 707, height_mm: 1000, group: 'ISO B' },
  { name: 'B2 (500 x 707 mm)', width_mm: 500, height_mm: 707, group: 'ISO B' },
  { name: 'B3 (353 x 500 mm)', width_mm: 353, height_mm: 500, group: 'ISO B' },
  { name: 'B4 (250 x 353 mm)', width_mm: 250, height_mm: 353, group: 'ISO B' },
  { name: 'B5 (176 x 250 mm)', width_mm: 176, height_mm: 250, group: 'ISO B' },
  { name: 'B6 (125 x 176 mm)', width_mm: 125, height_mm: 176, group: 'ISO B' },

  // JIS B Series
  { name: 'JIS B0 (1030 x 1456 mm)', width_mm: 1030, height_mm: 1456, group: 'JIS B' },
  { name: 'JIS B1 (728 x 1030 mm)', width_mm: 728, height_mm: 1030, group: 'JIS B' },
  { name: 'JIS B2 (515 x 728 mm)', width_mm: 515, height_mm: 728, group: 'JIS B' },
  { name: 'JIS B3 (364 x 515 mm)', width_mm: 364, height_mm: 515, group: 'JIS B' },
  { name: 'JIS B4 (257 x 364 mm)', width_mm: 257, height_mm: 364, group: 'JIS B' },
  { name: 'JIS B5 (182 x 257 mm)', width_mm: 182, height_mm: 257, group: 'JIS B' },
  { name: 'JIS B6 (128 x 182 mm)', width_mm: 128, height_mm: 182, group: 'JIS B' },
  { name: 'JIS B7 (91 x 128 mm)', width_mm: 91, height_mm: 128, group: 'JIS B' },
  
  // US Sizes
  { name: 'Letter (8.5 x 11 in)', width_mm: 215.9, height_mm: 279.4, group: 'US Standard' },
  { name: 'Legal (8.5 x 14 in)', width_mm: 215.9, height_mm: 355.6, group: 'US Standard' },
  { name: 'Tabloid / Ledger (11 x 17 in)', width_mm: 279.4, height_mm: 431.8, group: 'US Standard' },
  { name: 'Junior Legal (5 x 8 in)', width_mm: 127, height_mm: 203.2, group: 'US Standard' },
  
  // Common Business Cards
  { name: 'US Business Card (3.5 x 2 in)', width_mm: 88.9, height_mm: 50.8, group: 'Business Cards' },
  { name: 'EU Business Card (85 x 55 mm)', width_mm: 85, height_mm: 55, group: 'Business Cards' },
  { name: 'JP Business Card (91 x 55 mm)', width_mm: 91, height_mm: 55, group: 'Business Cards' },

  // Common Postcards
  { name: 'US Postcard (4 x 6 in)', width_mm: 101.6, height_mm: 152.4, group: 'Postcards' },
  { name: 'US Postcard Large (5 x 7 in)', width_mm: 127, height_mm: 177.8, group: 'Postcards' },
  { name: 'A6 Postcard (105 x 148 mm)', width_mm: 105, height_mm: 148, group: 'Postcards' }, // Same as A6
];

// --- Proofing Tool: Binding ---
export const PERFECT_BIND_GUTTER_INCHES = 0.125;
export const BINDING_TYPE_PROOFING_OPTIONS: { value: BindingTypeProofing; label: string }[] = [
  { value: 'perfectBound', label: 'Perfect Bound' },
  { value: 'saddleStitch', label: 'Saddle Stitch' },
];