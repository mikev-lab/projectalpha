import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  SheetConfig, ImpositionType, SheetOrientation, JobInfoState, SlipSheetColorName,
  PDFDocumentProxy as PDFJSDocumentProxy, PDFJSPageProxy, RenderParameters, ReadingDirection,
  RowOffsetType, AlternateRotationType
} from '../types';
import { 
  INCH_TO_POINTS, DEFAULT_PREVIEW_PAGE_WIDTH_POINTS, DEFAULT_PREVIEW_PAGE_HEIGHT_POINTS, DEFAULT_PREVIEW_PAGE_COUNT,
  SLUG_AREA_MARGIN_POINTS, QR_CODE_SIZE_POINTS, SLUG_TEXT_FONT_SIZE_POINTS, SLUG_TEXT_QR_PADDING_POINTS, 
  SLUG_AREA_BOTTOM_Y_POINTS, QR_GENERATION_PIXEL_SIZE, QR_SLUG_SHIFT_RIGHT_POINTS,
  CROP_MARK_LENGTH_POINTS, CROP_MARK_OFFSET_POINTS, CROP_MARK_THICKNESS_POINTS,
  SLIP_SHEET_COLORS
} from '../constants';
import { Icon } from './Icon';

// --- Types for Sheet Context List ---
interface SheetContextItemData {
  sheetNumber0Based: number;
  isFront: boolean;
  key: string; // e.g., "0-F" or "0-B"
  label: string; // e.g., "Sheet 1F" or "Sheet 1B"
}

interface ImpositionSettingsForThumbnail {
  selectedSheet: SheetConfig;
  columns: number;
  rows: number;
  bleedInches: number;
  horizontalGutterInches: number;
  verticalGutterInches: number;
  impositionType: ImpositionType;
  sheetOrientation: SheetOrientation;
  isDuplex: boolean;
  previewPageInfo: PreviewPageInfo; // Contains input PDF page count and dimensions
  rowOffsetType: RowOffsetType;
  alternateRotationType: AlternateRotationType;
}

interface SheetContextListItemProps {
  item: SheetContextItemData;
  isActive: boolean;
  onSelect: (sheetNumber0Based: number, isFront: boolean) => void;
  pdfJsDoc: PDFJSDocumentProxy | null;
  getCachedPage: (pageIndex: number, currentPdfJsDoc: PDFJSDocumentProxy | null) => Promise<HTMLCanvasElement | null>;
  impositionSettings: ImpositionSettingsForThumbnail;
  scrollContainerRef: React.RefObject<HTMLDivElement>; // Ref to the scrollable container
  // style prop for virtualization
  style?: React.CSSProperties; 
}

// --- Main PdfPreview Props ---
interface PdfPreviewProps {
  pdfDocProxy: PDFJSDocumentProxy | null;
  previewPageInfo: PreviewPageInfo | null;
  isPdfJsDocLoading: boolean;
  selectedSheet: SheetConfig;
  columns: number;
  rows: number;
  bleedInches: number;
  horizontalGutterInches: number;
  verticalGutterInches: number;
  impositionType: ImpositionType;
  sheetOrientation: SheetOrientation;
  isLoadingPdf: boolean; 
  includeInfo: boolean; 
  isDuplex: boolean;
  jobInfo: JobInfoState; 
  addFirstSheetSlip: boolean;
  firstSheetSlipColor: SlipSheetColorName;
  showSpineMarks: boolean;
  readingDirection: ReadingDirection;
  rowOffsetType: RowOffsetType;
  alternateRotationType: AlternateRotationType;
}

interface PreviewPageInfo {
  width: number; 
  height: number; 
  pageCount: number;
  error?: string;
}

interface LayoutMetrics {
  actualSheetWidthPoints: number;
  actualSheetHeightPoints: number;
  baseScaleToFit: number;
  effectiveScale: number;
  canvasWidth: number;
  canvasHeight: number;
}

const MAX_PAGE_CACHE_SIZE = 20; // Max number of input PDF pages to cache
const PAGES_TO_PIN_AT_START = 2; // Number of initial input PDF pages to "pin" in cache
const PAGES_TO_PIN_AT_END = 2;   // Number of final input PDF pages to "pin" in cache
const SHEETS_TO_CACHE_BEFORE = 2; // Number of output sheets before current to proactively cache input pages for
const SHEETS_TO_CACHE_AFTER = 2;  // Number of output sheets after current to proactively cache input pages for


const MIN_ZOOM_LEVEL = 0.25;
const MAX_ZOOM_LEVEL = 4.0;
const ZOOM_STEP = 0.25;
const ZOOM_STEP_WHEEL = 0.1;

const THUMBNAIL_RENDER_WIDTH = 160; // For offscreen rendering
const THUMBNAIL_RENDER_HEIGHT = 120; // For offscreen rendering (4:3 aspect ratio)

// --- Virtualization Constants for Thumbnail List ---
const THUMBNAIL_LIST_ITEM_HEIGHT_PX = 132; // Estimated height for one item (canvas + label + padding)
const OVERSCAN_COUNT = 5; // Number of items to render above/below visible window for smooth scroll

function formatDateForPreview(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() + userTimezoneOffset);
        const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
        const day = localDate.getDate().toString().padStart(2, '0');
        const year = localDate.getFullYear().toString().slice(-2);
        return `${month}/${day}/${year}`;
    } catch (e) {
        return dateString; 
    }
}

const calculateSlotPositions = (
    columns: number,
    rows: number,
    layoutCellWidth: number,
    layoutCellHeight: number,
    hGutterPoints: number,
    vGutterPoints: number,
    actualSheetWidthPoints: number,
    actualSheetHeightPoints: number,
    rowOffsetType: RowOffsetType
): { positions: { x: number, y: number }[], error: string | null } => {
    const slotPositions: { x: number, y: number }[] = [];
    
    let totalRequiredWidth = (layoutCellWidth * columns) + (Math.max(0, columns - 1) * hGutterPoints);
    if (rowOffsetType === 'half' && rows > 1) {
        totalRequiredWidth += (layoutCellWidth + hGutterPoints) / 2;
    }
    const totalRequiredHeight = (layoutCellHeight * rows) + (Math.max(0, rows - 1) * vGutterPoints);

    const startXBlock = (actualSheetWidthPoints - totalRequiredWidth) / 2;
    const startYBlock = (actualSheetHeightPoints - totalRequiredHeight) / 2;

    if (startXBlock < 0 || startYBlock < 0 || totalRequiredWidth > actualSheetWidthPoints || totalRequiredHeight > actualSheetHeightPoints) {
        return { positions: [], error: `Content (${columns}x${rows} grid) too large for sheet.` };
    }

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            let xPos = startXBlock + col * (layoutCellWidth + hGutterPoints);
            const yPos = startYBlock + (rows - 1 - row) * (layoutCellHeight + vGutterPoints);
            if (rowOffsetType === 'half' && row % 2 !== 0) {
                xPos += (layoutCellWidth + hGutterPoints) / 2;
            }
            slotPositions.push({ x: xPos, y: yPos });
        }
    }
    
    return { positions: slotPositions, error: null };
};

// Helper to get an array mapping slot index to input PDF page index for a given output sheet/side
function getPageMappingForSheet(
  physicalSheet0Based: number,
  isSheetSideFront: boolean,
  impositionType: ImpositionType,
  columns: number,
  rows: number,
  isDocumentDuplex: boolean,
  totalInputPdfPages: number
): (number | null)[] {
    const slotsPerSheet = columns * rows;
    if (slotsPerSheet === 0 || totalInputPdfPages === 0) return Array(slotsPerSheet).fill(null);

    let pageIndicesForSlots: (number | null)[] = Array(slotsPerSheet).fill(null);

    if (impositionType === 'booklet') {
        const paddedPageCount = Math.ceil(totalInputPdfPages / 4) * 4;
        const pageIndices = isSheetSideFront
          ? [paddedPageCount - (physicalSheet0Based * 2) - 1, physicalSheet0Based * 2] // Front Left, Front Right
          : [physicalSheet0Based * 2 + 1, paddedPageCount - (physicalSheet0Based * 2) - 2]; // Back Left, Back Right
        
        if (pageIndices[0] >= 0 && pageIndices[0] < totalInputPdfPages) pageIndicesForSlots[0] = pageIndices[0];
        if (pageIndices[1] >= 0 && pageIndices[1] < totalInputPdfPages) pageIndicesForSlots[1] = pageIndices[1];

    } else if (impositionType === 'stack') {
        const baseInputIndexForSheet = physicalSheet0Based * slotsPerSheet * (isDocumentDuplex ? 2 : 1);
        const pageOffset = isSheetSideFront ? 0 : 1;
        for (let i = 0; i < slotsPerSheet; i++) {
            const pageIndex = baseInputIndexForSheet + (isDocumentDuplex ? (i * 2) + pageOffset : i);
            if (pageIndex < totalInputPdfPages) {
                pageIndicesForSlots[i] = pageIndex;
            }
        }
    } else if (impositionType === 'repeat') {
        const masterPageIndex = physicalSheet0Based * (isDocumentDuplex ? 2 : 1) + (isSheetSideFront ? 0 : 1);
        if (masterPageIndex < totalInputPdfPages) {
            for (let i = 0; i < slotsPerSheet; i++) {
                pageIndicesForSlots[i] = masterPageIndex;
            }
        }
    } else { // collateCut
        const pagesPerLogicalStack = Math.ceil(totalInputPdfPages / slotsPerSheet);
        const totalSheetsForMode = isDocumentDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack;
        const totalSlotsPerColumn = totalSheetsForMode * (isDocumentDuplex ? 2 : 1);
        const pageOffsets: number[] = Array.from({ length: slotsPerSheet }, (_, i) => i * totalSlotsPerColumn);
        const logicalPageIndex = physicalSheet0Based * (isDocumentDuplex ? 2 : 1) + (isSheetSideFront ? 0 : 1);

        for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
            const pageToEmbedIndex = logicalPageIndex + pageOffsets[slotIndex];
            if (pageToEmbedIndex < totalInputPdfPages) {
                pageIndicesForSlots[slotIndex] = pageToEmbedIndex;
            }
        }
    }

    // Apply the reversal for work-and-turn on the back side
    if (!isSheetSideFront && isDocumentDuplex && (impositionType === 'stack' || impositionType === 'collateCut') && columns > 1) {
        const reversedRows: (number|null)[] = [];
        for (let row = 0; row < rows; row++) {
            const rowSlice = pageIndicesForSlots.slice(row * columns, (row + 1) * columns);
            reversedRows.push(...rowSlice.reverse());
        }
        return reversedRows;
    }
    
    return pageIndicesForSlots;
}


// --- Thumbnail Drawing Logic ---
const drawSheetThumbnailAsync = async (
    thumbnailCtx: CanvasRenderingContext2D,
    canvasWidth: number, // Actual canvas element width for drawing
    canvasHeight: number, // Actual canvas element height for drawing
    item: SheetContextItemData,
    pdfJsDoc: PDFJSDocumentProxy | null,
    getCachedPage: (pageIndex: number, currentPdfJsDoc: PDFJSDocumentProxy | null) => Promise<HTMLCanvasElement | null>,
    settings: ImpositionSettingsForThumbnail
) => {
    thumbnailCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    thumbnailCtx.fillStyle = '#f0f0f0'; // Light background for thumbnail area
    thumbnailCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (!pdfJsDoc || settings.previewPageInfo.pageCount === 0) {
        thumbnailCtx.fillStyle = 'gray';
        thumbnailCtx.font = '10px Arial';
        thumbnailCtx.textAlign = 'center';
        thumbnailCtx.fillText('No PDF', canvasWidth / 2, canvasHeight / 2);
        return;
    }

    let {
        selectedSheet, columns, rows, bleedInches, horizontalGutterInches, verticalGutterInches,
        impositionType, sheetOrientation, isDuplex, previewPageInfo, rowOffsetType, alternateRotationType
    } = settings;

    const isBookletMode = impositionType === 'booklet';
    if (isBookletMode) {
        columns = 2;
        rows = 1;
    }

    const bleedPoints = bleedInches * INCH_TO_POINTS;
    const hGutterPoints = horizontalGutterInches * INCH_TO_POINTS;
    const vGutterPoints = verticalGutterInches * INCH_TO_POINTS;
    const slotsPerSheet = columns * rows;
    
    const inputPageWidth = previewPageInfo.width;
    const inputPageHeight = previewPageInfo.height;
    const numInputPages = previewPageInfo.pageCount;

    if (inputPageWidth <= 0 || inputPageHeight <= 0) {
      thumbnailCtx.fillStyle = 'red'; thumbnailCtx.font = '10px Arial'; thumbnailCtx.textAlign = 'center';
      thumbnailCtx.fillText('Invalid Page Dims', canvasWidth / 2, canvasHeight / 2); return;
    }
     if (inputPageWidth < 2 * bleedPoints || inputPageHeight < 2 * bleedPoints) {
      thumbnailCtx.fillStyle = 'red'; thumbnailCtx.font = '10px Arial'; thumbnailCtx.textAlign = 'center';
      thumbnailCtx.fillText('Bleed too large', canvasWidth / 2, canvasHeight / 2); return;
    }


    const layoutCellWidth = inputPageWidth;
    const layoutCellHeight = inputPageHeight;
    
    let actualSheetWidthPoints: number, actualSheetHeightPoints: number;
    const paperLongSidePoints = selectedSheet.longSideInches * INCH_TO_POINTS;
    const paperShortSidePoints = selectedSheet.shortSideInches * INCH_TO_POINTS;

    if (sheetOrientation === 'portrait') {
        actualSheetWidthPoints = paperShortSidePoints; actualSheetHeightPoints = paperLongSidePoints;
    } else if (sheetOrientation === 'landscape') {
        actualSheetWidthPoints = paperLongSidePoints; actualSheetHeightPoints = paperShortSidePoints;
    } else { // Auto-detect for thumbnail (simplified: assume content fits one way or other)
        let cWidth = (layoutCellWidth * columns) + (Math.max(0, columns - 1) * hGutterPoints);
        if (rowOffsetType === 'half' && rows > 1) {
            cWidth += (layoutCellWidth + hGutterPoints) / 2;
        }
        let cHeight = (layoutCellHeight * rows) + (Math.max(0, rows - 1) * vGutterPoints);
        const fitL = cWidth <= paperLongSidePoints && cHeight <= paperShortSidePoints;
        const fitP = cWidth <= paperShortSidePoints && cHeight <= paperLongSidePoints;
        if (fitL) { actualSheetWidthPoints = paperLongSidePoints; actualSheetHeightPoints = paperShortSidePoints; }
        else if (fitP) { actualSheetWidthPoints = paperShortSidePoints; actualSheetHeightPoints = paperLongSidePoints; }
        else { actualSheetWidthPoints = paperLongSidePoints; actualSheetHeightPoints = paperShortSidePoints; } // Default if neither fits perfectly for auto
    }

    const scaleToFitCanvas = Math.min(canvasWidth / actualSheetWidthPoints, canvasHeight / actualSheetHeightPoints);
    thumbnailCtx.save();
    // Center the scaled sheet on the thumbnail canvas
    const scaledSheetDrawWidth = actualSheetWidthPoints * scaleToFitCanvas;
    const scaledSheetDrawHeight = actualSheetHeightPoints * scaleToFitCanvas;
    thumbnailCtx.translate((canvasWidth - scaledSheetDrawWidth) / 2, (canvasHeight - scaledSheetDrawHeight) / 2);
    thumbnailCtx.scale(scaleToFitCanvas, scaleToFitCanvas);

    // Draw sheet outline (optional, could be background color)
    thumbnailCtx.strokeStyle = '#cccccc';
    thumbnailCtx.lineWidth = 0.5 / scaleToFitCanvas; // Keep line thin
    thumbnailCtx.strokeRect(0, 0, actualSheetWidthPoints, actualSheetHeightPoints);

    const { positions: slotPositions, error: contentTooLargeError } = calculateSlotPositions(
      columns, rows, layoutCellWidth, layoutCellHeight, hGutterPoints, vGutterPoints, actualSheetWidthPoints, actualSheetHeightPoints, rowOffsetType
    );
     if(contentTooLargeError){
        thumbnailCtx.restore();
        thumbnailCtx.fillStyle = 'red'; thumbnailCtx.font = '10px Arial'; thumbnailCtx.textAlign = 'center';
        thumbnailCtx.fillText('Layout too large', canvasWidth / 2, canvasHeight / 2); return;
    }

    const pageMapping = getPageMappingForSheet(
        item.sheetNumber0Based,
        item.isFront,
        impositionType,
        columns,
        rows,
        isDuplex,
        numInputPages
    );

    for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
        const slotX = slotPositions[slotIndex].x, slotY = slotPositions[slotIndex].y;
        const pageToRenderIndex = pageMapping[slotIndex];

        const trimBoxX = slotX + bleedPoints, trimBoxY = slotY + bleedPoints;
        const trimBoxWidth = layoutCellWidth - (2 * bleedPoints), trimBoxHeight = layoutCellHeight - (2 * bleedPoints);

        if (pageToRenderIndex !== null && pageToRenderIndex >= 0 && pageToRenderIndex < numInputPages) {
            const cachedCanvas = await getCachedPage(pageToRenderIndex, pdfJsDoc);
            if (cachedCanvas) {
                const pageNativeWidth = cachedCanvas.width;
                const pageNativeHeight = cachedCanvas.height;
                const scaleToFitCell = Math.min(layoutCellWidth / pageNativeWidth, layoutCellHeight / pageNativeHeight);
                const drawnPageWidthInCell = pageNativeWidth * scaleToFitCell;
                const drawnPageHeightInCell = pageNativeHeight * scaleToFitCell;
                const cellContentDrawX = slotX + (layoutCellWidth - drawnPageWidthInCell) / 2;
                const cellContentDrawY = slotY + (layoutCellHeight - drawnPageHeightInCell) / 2;
                
                const row = Math.floor(slotIndex / columns);
                const col = slotIndex % columns;
                let shouldRotate = false;
                if (alternateRotationType === 'altCol') {
                    shouldRotate = col % 2 !== 0;
                } else if (alternateRotationType === 'altRow') {
                    shouldRotate = row % 2 !== 0;
                }
                
                thumbnailCtx.save();
                if (shouldRotate) {
                    thumbnailCtx.translate(cellContentDrawX + drawnPageWidthInCell / 2, cellContentDrawY + drawnPageHeightInCell / 2);
                    thumbnailCtx.rotate(Math.PI);
                    thumbnailCtx.drawImage(cachedCanvas, -drawnPageWidthInCell / 2, -drawnPageHeightInCell / 2, drawnPageWidthInCell, drawnPageHeightInCell);
                } else {
                    thumbnailCtx.drawImage(cachedCanvas, cellContentDrawX, cellContentDrawY, drawnPageWidthInCell, drawnPageHeightInCell);
                }
                thumbnailCtx.restore();

                // Draw simplified trim box
                if (bleedInches > 0) {
                    thumbnailCtx.strokeStyle = 'rgba(0,0,255,0.7)';
                    thumbnailCtx.lineWidth = 0.5 / scaleToFitCanvas;
                    thumbnailCtx.setLineDash([2 / scaleToFitCanvas, 2 / scaleToFitCanvas]);
                    thumbnailCtx.strokeRect(trimBoxX, trimBoxY, trimBoxWidth, trimBoxHeight);
                    thumbnailCtx.setLineDash([]);
                }
            } else {
                thumbnailCtx.fillStyle = 'rgba(255, 150, 150, 0.7)';
                thumbnailCtx.fillRect(slotX, slotY, layoutCellWidth, layoutCellHeight);
                thumbnailCtx.fillStyle = 'red'; thumbnailCtx.font = `${Math.max(8/scaleToFitCanvas, 6)}px Arial`; thumbnailCtx.textAlign = 'center';
                thumbnailCtx.fillText(`P${pageToRenderIndex+1} Err`, slotX + layoutCellWidth / 2, slotY + layoutCellHeight / 2);
            }
        } else {
            thumbnailCtx.fillStyle = 'rgba(220,220,220,0.5)'; // Lighter gray for empty slots
            thumbnailCtx.fillRect(slotX, slotY, layoutCellWidth, layoutCellHeight);
        }
    }
    thumbnailCtx.restore();
};

// --- SheetContextListItem Component ---
const SheetContextListItem: React.FC<SheetContextListItemProps> = React.memo(
  ({ item, isActive, onSelect, pdfJsDoc, getCachedPage, impositionSettings, scrollContainerRef, style }) => {
    const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
    const observableItemRef = useRef<HTMLButtonElement>(null); 
    const [isRenderingThumbnail, setIsRenderingThumbnail] = useState(false);
    const [isIntersecting, setIsIntersecting] = useState(false);
    
    useEffect(() => {
        const observerTarget = observableItemRef.current;
        const rootContainer = scrollContainerRef.current; 
        if (!observerTarget || !rootContainer) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsIntersecting(entry.isIntersecting);
            },
            { 
                root: rootContainer, 
                rootMargin: '100px 0px 100px 0px', // Pre-load slightly before visible
                threshold: 0.01 
            }
        );

        observer.observe(observerTarget);

        return () => {
            observer.unobserve(observerTarget);
        };
    }, [scrollContainerRef]); 

    useEffect(() => {
        const canvas = thumbnailCanvasRef.current;
        if (!canvas || !isIntersecting) { // Allow drawing even if pdfJsDoc is temporarily null, to clear canvas
            if (isRenderingThumbnail) setIsRenderingThumbnail(false);
            return;
        }

        let mounted = true;
        
        if (!isRenderingThumbnail) setIsRenderingThumbnail(true);

        drawSheetThumbnailAsync(
            canvas.getContext('2d')!, 
            THUMBNAIL_RENDER_WIDTH, 
            THUMBNAIL_RENDER_HEIGHT, 
            item, 
            pdfJsDoc, 
            getCachedPage, 
            impositionSettings
        ).finally(() => {
            if (mounted) {
                setIsRenderingThumbnail(false);
            }
        });
        
        return () => { mounted = false; };
    }, [item, pdfJsDoc, getCachedPage, impositionSettings, isIntersecting]); // isRenderingThumbnail removed


    return (
      <div style={style}> {/* Wrapper for absolute positioning */}
        <button
            ref={observableItemRef} // Ref for IntersectionObserver
            onClick={() => onSelect(item.sheetNumber0Based, item.isFront)}
            className={`w-full h-full p-2 text-left rounded-md transition-colors duration-150 flex flex-col ${
                isActive ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'hover:bg-gray-100'
            }`}
            aria-current={isActive ? 'true' : 'false'}
            aria-label={`Go to ${item.label}`}
        >
            <div className="w-full h-[100px] bg-gray-200 rounded overflow-hidden mb-1 relative"> {/* Fixed height for canvas container */}
                <canvas 
                    ref={thumbnailCanvasRef} 
                    width={THUMBNAIL_RENDER_WIDTH} 
                    height={THUMBNAIL_RENDER_HEIGHT}
                    className="w-full h-full object-contain"
                />
                {isIntersecting && isRenderingThumbnail && (
                    <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
                        <Icon iconName="spinner" className="w-5 h-5 text-indigo-500" />
                    </div>
                )}
                 {!isIntersecting && !isRenderingThumbnail && ( 
                    <div className="absolute inset-0 bg-gray-200 flex items-center justify-center">
                    </div>
                 )}
            </div>
            <p className={`text-xs font-medium truncate ${isActive ? 'text-indigo-700' : 'text-gray-700'}`}>
                {item.label}
            </p>
        </button>
      </div>
    );
});

// Helper to get input PDF page indices for a given output sheet/side
function getInputPdfPageIndicesForSheet(
  physicalSheet0Based: number,
  isSheetSideFront: boolean,
  impositionType: ImpositionType,
  columns: number,
  rows: number,
  isDocumentDuplex: boolean,
  totalInputPdfPages: number
): number[] {
  const indices: Set<number> = new Set();
  if (totalInputPdfPages === 0) return [];
  
  const slotsPerSheet = columns * rows;
  if (slotsPerSheet === 0) return [];

  if (impositionType === 'booklet') {
      const paddedPageCount = Math.ceil(totalInputPdfPages / 4) * 4;
      const sheetSidePageIndices = isSheetSideFront
        ? [paddedPageCount - (physicalSheet0Based * 2) - 1, physicalSheet0Based * 2] // Front Left, Front Right
        : [physicalSheet0Based * 2 + 1, paddedPageCount - (physicalSheet0Based * 2) - 2]; // Back Left, Back Right

      for (const pageIndex of sheetSidePageIndices) {
          if (pageIndex >= 0 && pageIndex < totalInputPdfPages) {
              indices.add(pageIndex);
          }
      }
      return Array.from(indices);
  }
  
  const pageMapping = getPageMappingForSheet(
    physicalSheet0Based, isSheetSideFront, impositionType, columns, rows, isDocumentDuplex, totalInputPdfPages
  );

  pageMapping.forEach(pageIndex => {
    if(pageIndex !== null) {
      indices.add(pageIndex);
    }
  });

  return Array.from(indices);
}


// --- Main PdfPreview Component ---
const PdfPreview: React.FC<PdfPreviewProps> = ({
  pdfDocProxy,
  previewPageInfo,
  isPdfJsDocLoading,
  selectedSheet,
  columns: propColumns,
  rows: propRows,
  bleedInches,
  horizontalGutterInches,
  verticalGutterInches,
  impositionType,
  sheetOrientation,
  isLoadingPdf: isMainProcessLoading, 
  includeInfo,
  isDuplex,
  jobInfo,
  addFirstSheetSlip,
  firstSheetSlipColor,
  showSpineMarks,
  readingDirection,
  rowOffsetType,
  alternateRotationType
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offScreenQrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const thumbnailScrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [currentPhysicalSheet0Based, setCurrentPhysicalSheet0Based] = useState<number>(0);
  const [currentSideIsFront, setCurrentSideIsFront] = useState<boolean>(true);
  const [totalPhysicalSheetsPreview, setTotalPhysicalSheetsPreview] = useState<number>(0);
  const [jumpToSheetInput, setJumpToSheetInput] = useState<string>('');
  
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panState, setPanState] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isContentPannable, setIsContentPannable] = useState<boolean>(false);
  const layoutMetricsRef = useRef<LayoutMetrics | null>(null);

  const pageRenderCacheRef = useRef(new Map<number, HTMLCanvasElement>());
  const pageRenderLruRef = useRef<number[]>([]);
  const pinnedPagesRef = useRef<Set<number>>(new Set());

  // Sheet Context List State
  const [sheetContextItems, setSheetContextItems] = useState<SheetContextItemData[]>([]);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listContainerHeight, setListContainerHeight] = useState(0);

  // Use local state for columns/rows to handle booklet override
  const isBookletMode = impositionType === 'booklet';
  const columns = isBookletMode ? 2 : propColumns;
  const rows = isBookletMode ? 1 : propRows;


  // Effect for setting up ResizeObserver for thumbnail list container height
  useEffect(() => {
    const container = thumbnailScrollContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setListContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    resizeObserverRef.current = observer; // Store observer to disconnect later

    // Initial height
    setListContainerHeight(container.clientHeight);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  const handleThumbnailScroll = (event: React.UIEvent<HTMLDivElement>) => {
    setListScrollTop(event.currentTarget.scrollTop);
  };


  useEffect(() => {
    if (!offScreenQrCanvasRef.current) {
        offScreenQrCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  const clearPageCache = useCallback(() => {
    pageRenderCacheRef.current.forEach(canvas => {});
    pageRenderCacheRef.current.clear();
    pageRenderLruRef.current = [];
    pinnedPagesRef.current.clear();
  }, []);
  
  useEffect(() => {
    // Reset view state when PDF document changes
    clearPageCache();
    setPanState({ x: 0, y: 0 });
    setZoomLevel(1.0);
    setCurrentPhysicalSheet0Based(0);
    setCurrentSideIsFront(true);
  }, [pdfDocProxy, clearPageCache]);


  const getCachedPage = useCallback(async (
    pageIndex: number, 
    currentPdfJsDoc: PDFJSDocumentProxy | null
  ): Promise<HTMLCanvasElement | null> => {
    if (pageRenderCacheRef.current.has(pageIndex)) {
      const lruIndex = pageRenderLruRef.current.indexOf(pageIndex);
      if (lruIndex !== -1) pageRenderLruRef.current.splice(lruIndex, 1);
      pageRenderLruRef.current.push(pageIndex); 
      return pageRenderCacheRef.current.get(pageIndex)!;
    }

    if (!currentPdfJsDoc) return null;

    try {
      const pdfPageProxy = await currentPdfJsDoc.getPage(pageIndex + 1); 
      const viewport = pdfPageProxy.getViewport({ scale: 1 }); 

      if (viewport.width <= 0 || viewport.height <= 0) {
        console.error(`Page ${pageIndex} has invalid viewport dimensions: ${viewport.width}x${viewport.height}`);
        return null;
      }

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = viewport.width;
      offscreenCanvas.height = viewport.height;
      const offscreenCtx = offscreenCanvas.getContext('2d');
      if (!offscreenCtx) return null;

      await pdfPageProxy.render({ canvasContext: offscreenCtx, viewport }).promise;

      if (pageRenderCacheRef.current.size >= MAX_PAGE_CACHE_SIZE) {
        let evicted = false;
        for (let i = 0; i < pageRenderLruRef.current.length; i++) {
            const oldestPageIndex = pageRenderLruRef.current[i];
            if (!pinnedPagesRef.current.has(oldestPageIndex)) { 
                pageRenderLruRef.current.splice(i, 1);
                pageRenderCacheRef.current.delete(oldestPageIndex);
                evicted = true;
                break;
            }
        }
         if(!evicted && pageRenderLruRef.current.length > 0 && pageRenderCacheRef.current.size >= MAX_PAGE_CACHE_SIZE) { 
             const oldestPageIndex = pageRenderLruRef.current.shift(); 
             if (oldestPageIndex !== undefined) {
                pageRenderCacheRef.current.delete(oldestPageIndex);
                pinnedPagesRef.current.delete(oldestPageIndex); 
             }
        }
      }
      
      if(pageRenderCacheRef.current.size < MAX_PAGE_CACHE_SIZE){ 
        pageRenderCacheRef.current.set(pageIndex, offscreenCanvas);
        pageRenderLruRef.current.push(pageIndex);
      }
      return offscreenCanvas;
    } catch (e) {
      console.error(`Error rendering page ${pageIndex} for cache:`, e);
      return null;
    }
  }, []); 


  const proactivelyCachePages = useCallback(async (
    pagesToCacheIndices: number[], 
    currentPdfJsDoc: PDFJSDocumentProxy | null,
    isPinned: boolean = false 
  ) => {
    if (!currentPdfJsDoc || pagesToCacheIndices.length === 0) return;

    for (const pageIndex of pagesToCacheIndices) {
      if (pageIndex < 0 || pageIndex >= currentPdfJsDoc.numPages) continue; 

      if (isPinned) {
        pinnedPagesRef.current.add(pageIndex);
      }
      
      if (!pageRenderCacheRef.current.has(pageIndex)) {
        getCachedPage(pageIndex, currentPdfJsDoc)
          .then(canvas => {
            if (!canvas && isPinned) {
              pinnedPagesRef.current.delete(pageIndex);
            }
          })
          .catch(e => {
            if (isPinned) {
              pinnedPagesRef.current.delete(pageIndex);
            }
          });
      } else if (isPinned && !pinnedPagesRef.current.has(pageIndex)) {
         pinnedPagesRef.current.add(pageIndex);
         const lruIndex = pageRenderLruRef.current.indexOf(pageIndex);
         if (lruIndex !== -1) pageRenderLruRef.current.splice(lruIndex, 1);
         pageRenderLruRef.current.push(pageIndex);
      }
    }
  }, [getCachedPage]); 


  useEffect(() => {
    if (pdfDocProxy) {
        const numPages = pdfDocProxy.numPages;
        const pagesToPinIndices: number[] = [];
        if (numPages > 0) {
            for(let i=0; i < PAGES_TO_PIN_AT_START && i < numPages; i++) pagesToPinIndices.push(i);
            for(let i=0; i < PAGES_TO_PIN_AT_END && (numPages - 1 - i) >=0 ; i++) {
                const pageIdx = numPages - 1 - i;
                if(!pagesToPinIndices.includes(pageIdx)) pagesToPinIndices.push(pageIdx);
            }
        }
        if (pagesToPinIndices.length > 0) {
            proactivelyCachePages(pagesToPinIndices, pdfDocProxy, true);
        }
    }
  }, [pdfDocProxy, proactivelyCachePages]);

  useEffect(() => {
    if (!pdfDocProxy || totalPhysicalSheetsPreview === 0 || !previewPageInfo || previewPageInfo.pageCount === 0 || isPdfJsDocLoading) return;
    const indicesToCache = new Set<number>();
    const startSheet = Math.max(0, currentPhysicalSheet0Based - SHEETS_TO_CACHE_BEFORE);
    const endSheet = Math.min(totalPhysicalSheetsPreview - 1, currentPhysicalSheet0Based + SHEETS_TO_CACHE_AFTER);
    for (let sheetIdx = startSheet; sheetIdx <= endSheet; sheetIdx++) {
      const frontPages = getInputPdfPageIndicesForSheet(sheetIdx, true, impositionType, columns, rows, isDuplex, previewPageInfo.pageCount);
      frontPages.forEach(p => indicesToCache.add(p));
      if (isDuplex) {
        const backPages = getInputPdfPageIndicesForSheet(sheetIdx, false, impositionType, columns, rows, isDuplex, previewPageInfo.pageCount);
        backPages.forEach(p => indicesToCache.add(p));
      }
    }
    if (indicesToCache.size > 0) {
      proactivelyCachePages(Array.from(indicesToCache), pdfDocProxy, false); 
    }
  }, [ pdfDocProxy, currentPhysicalSheet0Based, totalPhysicalSheetsPreview, impositionType, columns, rows, isDuplex, previewPageInfo, proactivelyCachePages, isPdfJsDocLoading ]);

  useEffect(() => {
    const numPages = previewPageInfo?.pageCount ?? 0;
    if (numPages <= 0) { setTotalPhysicalSheetsPreview(0); return; }
    
    let totalSheets = 0;
    if (impositionType === 'booklet') {
        const paddedPageCount = Math.ceil(numPages / 4) * 4;
        totalSheets = paddedPageCount / 4;
    } else {
        const slotsPerSheet = columns * rows;
        if (slotsPerSheet === 0) { setTotalPhysicalSheetsPreview(0); return; }
        if (impositionType === 'repeat') { totalSheets = isDuplex ? Math.ceil(numPages / 2) : numPages; }
        else if (impositionType === 'stack') { const slotsPerPhysicalSheet = slotsPerSheet * (isDuplex ? 2 : 1); totalSheets = Math.ceil(numPages / slotsPerPhysicalSheet); }
        else { // collateCut
            const pagesPerLogicalStack = Math.ceil(numPages / slotsPerSheet); 
            totalSheets = isDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack; 
        }
    }
    setTotalPhysicalSheetsPreview(Math.max(totalSheets, numPages > 0 ? 1 : 0));
  }, [previewPageInfo, columns, rows, impositionType, isDuplex]);

  useEffect(() => {
    if (!pdfDocProxy || totalPhysicalSheetsPreview === 0) { setSheetContextItems([]); return; }
    const items: SheetContextItemData[] = [];
    for (let i = 0; i < totalPhysicalSheetsPreview; i++) {
      items.push({ sheetNumber0Based: i, isFront: true, key: `${i}-F`, label: `Sheet ${i + 1}F` });
      if (isDuplex) { items.push({ sheetNumber0Based: i, isFront: false, key: `${i}-B`, label: `Sheet ${i + 1}B` }); }
    }
    setSheetContextItems(items);
  }, [pdfDocProxy, totalPhysicalSheetsPreview, isDuplex]);

  // Scroll active context item into view (for virtualized list)
  useEffect(() => {
    if (sheetContextItems.length === 0 || !pdfDocProxy || !thumbnailScrollContainerRef.current || listContainerHeight === 0) return;
    const activeItemIndex = sheetContextItems.findIndex(
        item => item.sheetNumber0Based === currentPhysicalSheet0Based && item.isFront === currentSideIsFront
    );
    if (activeItemIndex !== -1) {
        const targetScrollTop = activeItemIndex * THUMBNAIL_LIST_ITEM_HEIGHT_PX - (listContainerHeight / 2) + (THUMBNAIL_LIST_ITEM_HEIGHT_PX / 2);
        thumbnailScrollContainerRef.current.scrollTo({
            top: Math.max(0, targetScrollTop), // Ensure not scrolling to negative
            behavior: 'smooth'
        });
    }
  }, [currentPhysicalSheet0Based, currentSideIsFront, sheetContextItems, pdfDocProxy, listContainerHeight]);


  const handleSkipToFirstSheet = () => { setCurrentPhysicalSheet0Based(0); setCurrentSideIsFront(true); };
  const handleSkipToLastSheet = () => { if (totalPhysicalSheetsPreview > 0) { setCurrentPhysicalSheet0Based(totalPhysicalSheetsPreview - 1); setCurrentSideIsFront(isDuplex ? false : true); } };
  const handlePreviousSheet = () => { if (isDuplex) { if (!currentSideIsFront) { setCurrentSideIsFront(true); } else if (currentPhysicalSheet0Based > 0) { setCurrentPhysicalSheet0Based(prev => prev - 1); setCurrentSideIsFront(false); } } else if (currentPhysicalSheet0Based > 0) { setCurrentPhysicalSheet0Based(prev => prev - 1); } };
  const handleNextSheet = () => { if (isDuplex) { if (currentSideIsFront) { setCurrentSideIsFront(false); } else if (currentPhysicalSheet0Based < totalPhysicalSheetsPreview - 1) { setCurrentPhysicalSheet0Based(prev => prev + 1); setCurrentSideIsFront(true); } } else if (currentPhysicalSheet0Based < totalPhysicalSheetsPreview - 1) { setCurrentPhysicalSheet0Based(prev => prev + 1); } };
  const handleJumpToSheet = () => { const input = jumpToSheetInput.trim().toUpperCase(); if (!input) return; const numMatch = input.match(/^(\d+)/); if (!numMatch) { alert("Invalid. Start with number (e.g., '5', '5F')."); return; } const sheetNum1Based = parseInt(numMatch[1], 10); if (isNaN(sheetNum1Based) || sheetNum1Based <= 0 || (totalPhysicalSheetsPreview > 0 && sheetNum1Based > totalPhysicalSheetsPreview)) { alert(`Invalid sheet. Must be 1 to ${totalPhysicalSheetsPreview > 0 ? totalPhysicalSheetsPreview : 'N/A'}.`); return; } setCurrentPhysicalSheet0Based(sheetNum1Based - 1); setCurrentSideIsFront(isDuplex ? (!input.endsWith('B')) : true); setJumpToSheetInput(''); };
  const handleZoomIn = () => setZoomLevel(prev => Math.min(MAX_ZOOM_LEVEL, prev + ZOOM_STEP));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(MIN_ZOOM_LEVEL, prev - ZOOM_STEP));
  const handleZoomReset = () => { setZoomLevel(1.0); setPanState({ x: 0, y: 0 }); };
  const handleContextSheetSelect = (sheetNumber0Based: number, isFront: boolean) => { setCurrentPhysicalSheet0Based(sheetNumber0Based); setCurrentSideIsFront(isFront); };

  const drawCropMarksForPreview = (
    ctx: CanvasRenderingContext2D,
    trimAreaX: number,
    trimAreaY: number,
    trimAreaWidth: number,
    trimAreaHeight: number,
    currentEffectiveScale: number,
    options: {
        hasTopNeighbor?: boolean;
        hasBottomNeighbor?: boolean;
        hasLeftNeighbor?: boolean;
        hasRightNeighbor?: boolean;
    } = {}
) => {
    const color = 'rgba(50, 50, 50, 0.7)';
    const thickness = Math.max(CROP_MARK_THICKNESS_POINTS * currentEffectiveScale, 0.5) / currentEffectiveScale;
    const length = CROP_MARK_LENGTH_POINTS;
    const offset = CROP_MARK_OFFSET_POINTS;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;

    const { hasTopNeighbor, hasBottomNeighbor, hasLeftNeighbor, hasRightNeighbor } = options;

    // TOP EDGE
    if (!hasTopNeighbor) {
        ctx.beginPath(); ctx.moveTo(trimAreaX, trimAreaY + trimAreaHeight + offset); ctx.lineTo(trimAreaX, trimAreaY + trimAreaHeight + offset + length); ctx.stroke(); // top-left
        ctx.beginPath(); ctx.moveTo(trimAreaX + trimAreaWidth, trimAreaY + trimAreaHeight + offset); ctx.lineTo(trimAreaX + trimAreaWidth, trimAreaY + trimAreaHeight + offset + length); ctx.stroke(); // top-right
    }

    // BOTTOM EDGE
    if (!hasBottomNeighbor) {
        ctx.beginPath(); ctx.moveTo(trimAreaX, trimAreaY - offset); ctx.lineTo(trimAreaX, trimAreaY - offset - length); ctx.stroke(); // bottom-left
        ctx.beginPath(); ctx.moveTo(trimAreaX + trimAreaWidth, trimAreaY - offset); ctx.lineTo(trimAreaX + trimAreaWidth, trimAreaY - offset - length); ctx.stroke(); // bottom-right
    }

    // LEFT EDGE
    if (!hasLeftNeighbor) {
        ctx.beginPath(); ctx.moveTo(trimAreaX - offset, trimAreaY + trimAreaHeight); ctx.lineTo(trimAreaX - offset - length, trimAreaY + trimAreaHeight); ctx.stroke(); // top-left
        ctx.beginPath(); ctx.moveTo(trimAreaX - offset, trimAreaY); ctx.lineTo(trimAreaX - offset - length, trimAreaY); ctx.stroke(); // bottom-left
    }

    // RIGHT EDGE
    if (!hasRightNeighbor) {
        ctx.beginPath(); ctx.moveTo(trimAreaX + trimAreaWidth + offset, trimAreaY + trimAreaHeight); ctx.lineTo(trimAreaX + trimAreaWidth + offset + length, trimAreaY + trimAreaHeight); ctx.stroke(); // top-right
        ctx.beginPath(); ctx.moveTo(trimAreaX + trimAreaWidth + offset, trimAreaY); ctx.lineTo(trimAreaX + trimAreaWidth + offset + length, trimAreaY); ctx.stroke(); // bottom-right
    }

    ctx.restore();
  };

  const drawSpineIndicatorForPreview = (ctx: CanvasRenderingContext2D, trimAreaX: number, trimAreaY: number, trimAreaWidth: number, trimAreaHeight: number, isSpineOnLeft: boolean, currentEffectiveScale: number) => {
    const TRIANGLE_HEIGHT = 5;
    const TRIANGLE_BASE = 7;
    const TEXT_SIZE = 5;
    const TEXT_OFFSET_Y = 1;
    const INDICATOR_OFFSET_FROM_CROP = 5;

    const indicatorY = trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS + INDICATOR_OFFSET_FROM_CROP;
    const xCenter = isSpineOnLeft ? trimAreaX : trimAreaX + trimAreaWidth;
    
    ctx.save();
    ctx.strokeStyle = "black";
    ctx.fillStyle = "black";
    ctx.lineWidth = CROP_MARK_THICKNESS_POINTS / currentEffectiveScale;

    // Draw triangle
    ctx.beginPath();
    ctx.moveTo(xCenter - TRIANGLE_BASE / 2, indicatorY);
    ctx.lineTo(xCenter + TRIANGLE_BASE / 2, indicatorY);
    ctx.lineTo(xCenter, indicatorY - TRIANGLE_HEIGHT);
    ctx.closePath();
    ctx.stroke();

    // Draw "SPINE" text
    const text = "SPINE";
    ctx.font = `${TEXT_SIZE}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(text, xCenter, indicatorY + TEXT_OFFSET_Y);
    ctx.restore();
  };
  
  const drawSpineSlugTextForPreview = (ctx: CanvasRenderingContext2D, trimAreaX: number, trimAreaY: number, trimAreaWidth: number, trimAreaHeight: number, isSpineOnLeft: boolean, isFrontSide: boolean, bleedPoints: number) => {
    const TEXT_SIZE_PT = 5;
    
    const label = isFrontSide ? 'FRONT SPINE' : 'BACK SPINE';
    const repeatingPart = ' - ' + label;
    
    let text = label;
    // Simple repetition for preview is sufficient
    for (let i = 0; i < 4; i++) {
        text += repeatingPart;
    }
    
    const gapFromBleedEdge = CROP_MARK_OFFSET_POINTS;

    let x: number;
    const y: number = trimAreaY;

    if (isSpineOnLeft) {
        x = trimAreaX - bleedPoints - gapFromBleedEdge - TEXT_SIZE_PT;
    } else {
        x = trimAreaX + trimAreaWidth + bleedPoints + gapFromBleedEdge;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2); // 90 degrees counter-clockwise
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.font = `${TEXT_SIZE_PT}px sans-serif`;
    ctx.fillStyle = "black";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current; const offScreenQrCanvas = offScreenQrCanvasRef.current;
    const previewContainer = previewAreaRef.current;
    if (!canvas || !offScreenQrCanvas || !previewContainer || isMainProcessLoading) return;
    canvas.width = previewContainer.clientWidth; canvas.height = previewContainer.clientHeight;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let mounted = true;
    const drawPreviewAsyncInternal = async () => {
      if (!mounted) return; ctx.clearRect(0, 0, canvas.width, canvas.height);
      const computedStyle = getComputedStyle(previewContainer); const previewBgColor = computedStyle.backgroundColor || 'rgb(243, 244, 246)'; 
      let currentActualSheetWidthPoints = 0, currentActualSheetHeightPoints = 0, currentBaseScaleToFit = 1, currentEffectiveScale = 1;
      try {
        if (!pdfDocProxy) { 
            ctx.fillStyle = 'gray'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; 
            const message = isPdfJsDocLoading ? 'Loading PDF...' : 'Upload PDF';
            ctx.fillText(message, canvas.width / 2, canvas.height / 2); 
            setIsContentPannable(false); layoutMetricsRef.current = null; return; 
        }
        if (!previewPageInfo) { ctx.fillStyle = 'gray'; ctx.font = '14px Arial'; ctx.textAlign = 'center'; ctx.fillText('Loading Page Info...', canvas.width / 2, canvas.height / 2); setIsContentPannable(false); layoutMetricsRef.current = null; return; }
        if (previewPageInfo.error) { ctx.fillStyle = 'red'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.fillText(previewPageInfo.error, canvas.width / 2, canvas.height / 2); setIsContentPannable(false); layoutMetricsRef.current = null; return; }

        const numInputPages = previewPageInfo.pageCount;
        const bleedPoints = bleedInches * INCH_TO_POINTS; const hGutterPoints = horizontalGutterInches * INCH_TO_POINTS; const vGutterPoints = verticalGutterInches * INCH_TO_POINTS; const uploadedPageFullWidth = previewPageInfo.width; const uploadedPageFullHeight = previewPageInfo.height;
        if (uploadedPageFullWidth <= 0 || uploadedPageFullHeight <= 0) { ctx.fillStyle = 'red'; ctx.font = '12px Arial'; ctx.fillText(previewPageInfo.error || "Invalid input dims.", canvas.width / 2, canvas.height / 2); setIsContentPannable(false); layoutMetricsRef.current = null; return; }
        if (uploadedPageFullWidth < 2 * bleedPoints || uploadedPageFullHeight < 2 * bleedPoints) { ctx.fillStyle = 'red'; ctx.font = '12px Arial'; ctx.fillText(`Bleed (${bleedInches}") too large.`, canvas.width / 2, canvas.height / 2); setIsContentPannable(false); layoutMetricsRef.current = null; return; }
        const layoutCellWidth = uploadedPageFullWidth; const layoutCellHeight = uploadedPageFullHeight; const paperLongSidePoints = selectedSheet.longSideInches * INCH_TO_POINTS; const paperShortSidePoints = selectedSheet.shortSideInches * INCH_TO_POINTS;
        if (sheetOrientation === 'portrait') { currentActualSheetWidthPoints = paperShortSidePoints; currentActualSheetHeightPoints = paperLongSidePoints; }
        else if (sheetOrientation === 'landscape') { currentActualSheetWidthPoints = paperLongSidePoints; currentActualSheetHeightPoints = paperShortSidePoints; }
        else { 
            let cWidth = (layoutCellWidth * columns) + (Math.max(0, columns - 1) * hGutterPoints);
            if (rowOffsetType === 'half' && rows > 1) {
                cWidth += (layoutCellWidth + hGutterPoints) / 2;
            }
            let cHeight = (layoutCellHeight * rows) + (Math.max(0, rows - 1) * vGutterPoints); 
            const fitL = cWidth <= paperLongSidePoints && cHeight <= paperShortSidePoints; 
            const fitP = cWidth <= paperShortSidePoints && cHeight <= paperLongSidePoints; 
            if (fitL && fitP) { currentActualSheetWidthPoints = (cWidth / paperLongSidePoints > cHeight / paperShortSidePoints) ? paperLongSidePoints : paperShortSidePoints; currentActualSheetHeightPoints = (cWidth / paperLongSidePoints > cHeight / paperShortSidePoints) ? paperShortSidePoints : paperLongSidePoints; } 
            else if (fitL) { currentActualSheetWidthPoints = paperLongSidePoints; currentActualSheetHeightPoints = paperShortSidePoints; } 
            else if (fitP) { currentActualSheetWidthPoints = paperShortSidePoints; currentActualSheetHeightPoints = paperLongSidePoints; } 
            else { currentActualSheetWidthPoints = paperLongSidePoints; currentActualSheetHeightPoints = paperShortSidePoints; ctx.fillStyle = 'red'; ctx.fillText("Content too large (auto)", canvas.width / 2, canvas.height / 2); setIsContentPannable(false); layoutMetricsRef.current = null; return; } 
        }
        const canvasPadding = 10; currentBaseScaleToFit = Math.min( (canvas.width - 2 * canvasPadding) / currentActualSheetWidthPoints, (canvas.height - 2 * canvasPadding) / currentActualSheetHeightPoints );
        currentEffectiveScale = currentBaseScaleToFit * zoomLevel; layoutMetricsRef.current = { actualSheetWidthPoints: currentActualSheetWidthPoints, actualSheetHeightPoints: currentActualSheetHeightPoints, baseScaleToFit: currentBaseScaleToFit, effectiveScale: currentEffectiveScale, canvasWidth: canvas.width, canvasHeight: canvas.height }; const scaledSheetContentWidth = currentActualSheetWidthPoints * currentEffectiveScale; const scaledSheetContentHeight = currentActualSheetHeightPoints * currentEffectiveScale;
        if (mounted) setIsContentPannable(zoomLevel > 1.0 && (scaledSheetContentWidth > canvas.width || scaledSheetContentHeight > canvas.height));
        ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.translate(panState.x, panState.y); ctx.scale(currentEffectiveScale, currentEffectiveScale); ctx.translate(-currentActualSheetWidthPoints / 2, -currentActualSheetHeightPoints / 2);
        
        const { positions: slotPositions, error: layoutError } = calculateSlotPositions(columns, rows, layoutCellWidth, layoutCellHeight, hGutterPoints, vGutterPoints, currentActualSheetWidthPoints, currentActualSheetHeightPoints, rowOffsetType);

        if (addFirstSheetSlip && currentPhysicalSheet0Based === 0 && currentSideIsFront) { const selectedColorObj = SLIP_SHEET_COLORS.find(c => c.name === firstSheetSlipColor); ctx.fillStyle = selectedColorObj ? selectedColorObj.cssColor : SLIP_SHEET_COLORS.find(c=>c.name==='Grey')!.cssColor; ctx.fillRect(0, 0, currentActualSheetWidthPoints, currentActualSheetHeightPoints); ctx.fillStyle = previewBgColor; for (const pos of slotPositions) { if (pos.x >=0 && pos.y >=0) { ctx.fillRect(pos.x, pos.y, layoutCellWidth, layoutCellHeight); } } if (includeInfo && numInputPages > 0) { const slugMaskX = SLUG_AREA_MARGIN_POINTS; const slugMaskY = currentActualSheetHeightPoints - QR_CODE_SIZE_POINTS - SLUG_AREA_BOTTOM_Y_POINTS; const slugMaskWidth = currentActualSheetWidthPoints - (2 * SLUG_AREA_MARGIN_POINTS); const slugMaskHeight = QR_CODE_SIZE_POINTS; ctx.fillRect(slugMaskX, slugMaskY, slugMaskWidth, slugMaskHeight); } }
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1 / currentEffectiveScale; ctx.strokeRect(0, 0, currentActualSheetWidthPoints, currentActualSheetHeightPoints);
        
        if(layoutError){ ctx.restore(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'red'; ctx.fillText("Layout too large.", canvas.width / 2, canvas.height / 2); setIsContentPannable(false); layoutMetricsRef.current = null; return; }
        
        const pageMapping = getPageMappingForSheet(currentPhysicalSheet0Based, currentSideIsFront, impositionType, columns, rows, isDuplex, numInputPages);

        for (let slotIndex = 0; slotIndex < slotPositions.length; slotIndex++) {
          if (!slotPositions[slotIndex] || !pdfDocProxy) continue; 
          const slotX = slotPositions[slotIndex].x, slotY = slotPositions[slotIndex].y; 
          const pageToRenderIndex = pageMapping[slotIndex];

          const trimBoxX = slotX + bleedPoints, trimBoxY = slotY + bleedPoints; const trimBoxWidth = layoutCellWidth - (2 * bleedPoints), trimBoxHeight = layoutCellHeight - (2 * bleedPoints);
          if (pageToRenderIndex !== null && pageToRenderIndex >= 0 && pageToRenderIndex < numInputPages) { 
            const cachedCanvas = await getCachedPage(pageToRenderIndex, pdfDocProxy); 
            if (cachedCanvas) { 
                const pageNativeWidth = cachedCanvas.width; const pageNativeHeight = cachedCanvas.height; const scaleToFitCell = Math.min(layoutCellWidth / pageNativeWidth, layoutCellHeight / pageNativeHeight); const drawnPageWidthInCell = pageNativeWidth * scaleToFitCell; const drawnPageHeightInCell = pageNativeHeight * scaleToFitCell; const cellContentDrawX = slotX + (layoutCellWidth - drawnPageWidthInCell) / 2; const cellContentDrawY = slotY + (layoutCellHeight - drawnPageHeightInCell) / 2;
                
                const row = Math.floor(slotIndex / columns);
                const col = slotIndex % columns;
                let shouldRotate = false;
                if (alternateRotationType === 'altCol') {
                    shouldRotate = col % 2 !== 0;
                } else if (alternateRotationType === 'altRow') {
                    shouldRotate = row % 2 !== 0;
                }

                if (shouldRotate) {
                    ctx.save();
                    ctx.translate(cellContentDrawX + drawnPageWidthInCell / 2, cellContentDrawY + drawnPageHeightInCell / 2);
                    ctx.rotate(Math.PI);
                    ctx.drawImage(cachedCanvas, -drawnPageWidthInCell / 2, -drawnPageHeightInCell / 2, drawnPageWidthInCell, drawnPageHeightInCell);
                    ctx.restore();
                } else {
                    ctx.drawImage(cachedCanvas, cellContentDrawX, cellContentDrawY, drawnPageWidthInCell, drawnPageHeightInCell);
                }
            } else { ctx.fillStyle = 'rgba(255,150,150,0.5)'; ctx.fillRect(slotX,slotY,layoutCellWidth,layoutCellHeight); ctx.fillStyle = 'red'; const errFS = Math.max(8/currentEffectiveScale,10); ctx.font = `${errFS}px Arial`; ctx.fillText(`CacheErr P${pageToRenderIndex+1}`, slotX+layoutCellWidth/2, slotY+layoutCellHeight/2); } 
            if (bleedInches > 0) {
              const row = Math.floor(slotIndex / columns);
              const col = slotIndex % columns;
              const cropMarkOptions = {
                  hasTopNeighbor: row > 0,
                  hasBottomNeighbor: row < rows - 1,
                  hasLeftNeighbor: col > 0,
                  hasRightNeighbor: col < columns - 1,
              };
              drawCropMarksForPreview(ctx, trimBoxX, trimBoxY, trimBoxWidth, trimBoxHeight, currentEffectiveScale, cropMarkOptions);
            }
            if (showSpineMarks && isBookletMode) {
                const isLeftPage = slotIndex === 0;
                const isSpineOnLeft = readingDirection === 'ltr' ? !isLeftPage : isLeftPage;
                
                drawSpineSlugTextForPreview(ctx, trimBoxX, trimBoxY, trimBoxWidth, trimBoxHeight, isSpineOnLeft, currentSideIsFront, bleedPoints);

                if (currentPhysicalSheet0Based === 0 || currentPhysicalSheet0Based === totalPhysicalSheetsPreview - 1) {
                    drawSpineIndicatorForPreview(ctx, trimBoxX, trimBoxY, trimBoxWidth, trimBoxHeight, isSpineOnLeft, currentEffectiveScale);
                }
            } else if (showSpineMarks && (impositionType === 'stack' || impositionType === 'collateCut' || impositionType === 'repeat')) {
                const row = Math.floor(slotIndex / columns);
                const col = slotIndex % columns;
                let shouldRotate = alternateRotationType === 'altCol' ? col % 2 !== 0 : alternateRotationType === 'altRow' ? row % 2 !== 0 : false;
                
                // For work-and-turn, the spine side flips on the back.
                let baseSpineIsLeft = readingDirection === 'ltr';
                if (!currentSideIsFront) {
                    baseSpineIsLeft = !baseSpineIsLeft;
                }
                const finalSpineIsLeft = shouldRotate ? !baseSpineIsLeft : baseSpineIsLeft;
                drawSpineSlugTextForPreview(ctx, trimBoxX, trimBoxY, trimBoxWidth, trimBoxHeight, finalSpineIsLeft, currentSideIsFront, bleedPoints);
            }
            const pageLabelFS = Math.max(10/currentEffectiveScale,8); ctx.font = `bold ${pageLabelFS}px Arial`; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`P${pageToRenderIndex+1}`, slotX+(2/currentEffectiveScale), slotY+(2/currentEffectiveScale)); 
        }
          else { ctx.fillStyle = 'rgba(200,200,200,0.3)'; ctx.fillRect(slotX,slotY,layoutCellWidth,layoutCellHeight); ctx.fillStyle = '#aaaaaa'; const emptyFS=Math.max(8/currentEffectiveScale,10); ctx.font = `${emptyFS}px Arial`; ctx.fillText(`Empty`, slotX+layoutCellWidth/2, slotY+layoutCellHeight/2); }
          ctx.strokeStyle = 'rgba(0,0,255,0.7)'; ctx.lineWidth = 0.5/currentEffectiveScale; ctx.setLineDash([2/currentEffectiveScale,2/currentEffectiveScale]); ctx.strokeRect(trimBoxX,trimBoxY,trimBoxWidth,trimBoxHeight); ctx.setLineDash([]);
        }
        if (includeInfo && numInputPages > 0 && window.QRious && pdfDocProxy) { const qrX = SLUG_AREA_MARGIN_POINTS + QR_SLUG_SHIFT_RIGHT_POINTS; const qrY = currentActualSheetHeightPoints - QR_CODE_SIZE_POINTS - SLUG_AREA_BOTTOM_Y_POINTS; const sheetId = `${currentPhysicalSheet0Based + 1}${isDuplex ? (currentSideIsFront ? 'F' : 'B') : ''}`; const trimSz = (jobInfo.finalTrimWidth&&jobInfo.finalTrimHeight)?`${jobInfo.finalTrimWidth}x${jobInfo.finalTrimHeight}`:'N/A'; const dueDt = formatDateForPreview(jobInfo.dueDate); const qty = jobInfo.quantity || 'N/A'; const jobNm = jobInfo.jobIdName || (jobInfo.fileNameTitle || "Job"); const slugTxt = `Sheet: ${sheetId}/${totalPhysicalSheetsPreview} | Job: ${jobNm.substring(0,15)}... | Qty: ${qty} | Due: ${dueDt} | Trim: ${trimSz}`; let qrData = `Sheet: ${sheetId}/${totalPhysicalSheetsPreview}\nJobID: ${jobInfo.jobIdName||'N/A'}\nFile: ${jobInfo.fileNameTitle}\nQty: ${qty}\nDue: ${dueDt}\nTrim: ${trimSz}`; try { new window.QRious({ element: offScreenQrCanvas, value: qrData, size: QR_GENERATION_PIXEL_SIZE, level: 'M', padding: 0 }); ctx.drawImage(offScreenQrCanvas, qrX, qrY, QR_CODE_SIZE_POINTS, QR_CODE_SIZE_POINTS); } catch (qrErr) { console.error("Preview QR Err:", qrErr); ctx.fillStyle='rgba(100,100,100,0.8)'; ctx.fillRect(qrX,qrY,QR_CODE_SIZE_POINTS,QR_CODE_SIZE_POINTS); const errFS=Math.max(SLUG_TEXT_FONT_SIZE_POINTS*0.8/currentEffectiveScale,6); ctx.font=`${errFS}px Arial`; ctx.fillStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText("QR Err",qrX+QR_CODE_SIZE_POINTS/2,qrY+QR_CODE_SIZE_POINTS/2); } const slugFS = Math.max(SLUG_TEXT_FONT_SIZE_POINTS/currentEffectiveScale,6); ctx.font = `${slugFS}px Arial`; ctx.fillStyle = 'rgba(50,50,50,0.8)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';  const txtX = qrX + QR_CODE_SIZE_POINTS + (SLUG_TEXT_QR_PADDING_POINTS); const txtY = qrY + (QR_CODE_SIZE_POINTS / 2) ; const maxTxtW = currentActualSheetWidthPoints - txtX - SLUG_AREA_MARGIN_POINTS; let dspTxt = slugTxt; const tempFont = ctx.font; ctx.font = `${slugFS}px Arial`; if(ctx.measureText(dspTxt).width > maxTxtW) { while(ctx.measureText(dspTxt+"...").width > maxTxtW && dspTxt.length > 0) dspTxt = dspTxt.slice(0,-1); dspTxt += "..."; } ctx.font = tempFont; ctx.fillText(dspTxt, txtX, txtY);  }
        ctx.restore(); 
      } catch (error) { console.error("Unhandled err in drawPreviewAsyncInternal:", error); if (mounted) { try { ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='red';ctx.fillText("Critical preview error.",canvas.width/2,canvas.height/2);ctx.restore(); } catch (e) {} } }
    };
    drawPreviewAsyncInternal(); return () => { mounted = false; };
  }, [ pdfDocProxy, previewPageInfo, selectedSheet, columns, rows, bleedInches, horizontalGutterInches, verticalGutterInches, impositionType, sheetOrientation, isMainProcessLoading, includeInfo, isDuplex, jobInfo, zoomLevel, panState, currentPhysicalSheet0Based, currentSideIsFront, totalPhysicalSheetsPreview, getCachedPage, addFirstSheetSlip, firstSheetSlipColor, showSpineMarks, readingDirection, rowOffsetType, alternateRotationType, isPdfJsDocLoading ]);

  const getPointerPosition = useCallback((event: MouseEvent | TouchEvent | WheelEvent, canvasEl: HTMLCanvasElement | null) => { if (!canvasEl) return { x: 0, y: 0 }; const rect = canvasEl.getBoundingClientRect(); const x = 'touches' in event ? event.touches[0].clientX : event.clientX; const y = 'touches' in event ? event.touches[0].clientY : event.clientY; return { x: x - rect.left, y: y - rect.top }; }, []);
  const handlePanStart = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => { if (!layoutMetricsRef.current || !previewAreaRef.current) return; const { actualSheetWidthPoints, actualSheetHeightPoints, baseScaleToFit, canvasWidth, canvasHeight } = layoutMetricsRef.current; const currentEffectiveScale = baseScaleToFit * zoomLevel; const scaledContentWidth = actualSheetWidthPoints * currentEffectiveScale; const scaledContentHeight = actualSheetHeightPoints * currentEffectiveScale; const isCurrentlyPannable = zoomLevel > 1.0 && (scaledContentWidth > canvasWidth || scaledContentHeight > canvasHeight); if (!isCurrentlyPannable) return; if ('touches' in event && event.touches.length > 1) return; if ('preventDefault' in event.nativeEvent && event.nativeEvent.cancelable) event.nativeEvent.preventDefault(); setIsPanning(true); const pointerPos = getPointerPosition(event.nativeEvent, canvasRef.current); panStartPointRef.current = pointerPos; }, [zoomLevel, getPointerPosition]);
  const handlePanMove = useCallback((event: MouseEvent | TouchEvent) => { if (!isPanning || !panStartPointRef.current || !layoutMetricsRef.current || !previewAreaRef.current) return; if ('touches' in event && event.touches.length > 1) { setIsPanning(false); panStartPointRef.current = null; return; } if (event.cancelable) event.preventDefault(); const pointerPos = getPointerPosition(event, canvasRef.current); const dx = pointerPos.x - panStartPointRef.current.x; const dy = pointerPos.y - panStartPointRef.current.y; setPanState(prevPanState => { const { actualSheetWidthPoints, actualSheetHeightPoints, baseScaleToFit, canvasWidth, canvasHeight } = layoutMetricsRef.current!; const currentEffectiveScale = baseScaleToFit * zoomLevel; const scaledContentWidth = actualSheetWidthPoints*currentEffectiveScale; const scaledContentHeight = actualSheetHeightPoints*currentEffectiveScale; let newX = prevPanState.x + dx; let newY = prevPanState.y + dy; const maxPanX = Math.max(0, (scaledContentWidth-canvasWidth)/2); const minPanX = -maxPanX; const maxPanY = Math.max(0, (scaledContentHeight-canvasHeight)/2); const minPanY = -maxPanY; newX = Math.max(minPanX,Math.min(maxPanX,newX)); newY = Math.max(minPanY,Math.min(maxPanY,newY)); return {x:newX,y:newY}; }); panStartPointRef.current = pointerPos; }, [isPanning, zoomLevel, getPointerPosition]);
  const handlePanEnd = useCallback(() => { setIsPanning(false); panStartPointRef.current = null; }, []);
  const handleWheelZoom = useCallback((event: WheelEvent) => { if (!layoutMetricsRef.current || !canvasRef.current) return; event.preventDefault(); const { actualSheetWidthPoints, actualSheetHeightPoints, baseScaleToFit, canvasWidth, canvasHeight } = layoutMetricsRef.current; const mousePos = getPointerPosition(event, canvasRef.current); const oldEffectiveScale = baseScaleToFit * zoomLevel; const sheetPointX = ((mousePos.x - canvasWidth/2 - panState.x) / oldEffectiveScale) + actualSheetWidthPoints/2; const sheetPointY = ((mousePos.y - canvasHeight/2 - panState.y) / oldEffectiveScale) + actualSheetHeightPoints/2; const zoomDirection = event.deltaY < 0 ? 1 : -1; let newZoomLevel = zoomLevel + zoomDirection * ZOOM_STEP_WHEEL; newZoomLevel = Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, newZoomLevel)); if (newZoomLevel === zoomLevel) return; setZoomLevel(newZoomLevel); if (newZoomLevel === 1.0) { setPanState({ x: 0, y: 0 }); } else { const newEffectiveScale = baseScaleToFit * newZoomLevel; let newPanX = mousePos.x - canvasWidth/2 - (sheetPointX - actualSheetWidthPoints/2) * newEffectiveScale; let newPanY = mousePos.y - canvasHeight/2 - (sheetPointY - actualSheetHeightPoints/2) * newEffectiveScale; const scaledContentWidth = actualSheetWidthPoints*newEffectiveScale; const scaledContentHeight = actualSheetHeightPoints*newEffectiveScale; const maxPanX = Math.max(0, (scaledContentWidth-canvasWidth)/2); const minPanX = -maxPanX; const maxPanY = Math.max(0, (scaledContentHeight-canvasHeight)/2); const minPanY = -maxPanY; newPanX = Math.max(minPanX,Math.min(maxPanX,newPanX)); newPanY = Math.max(minPanY,Math.min(maxPanY,newPanY)); setPanState({x:newPanX,y:newPanY}); } }, [zoomLevel, panState, getPointerPosition]);

  useEffect(() => { const previewNode = previewAreaRef.current; if (!previewNode) return; window.addEventListener('mousemove', handlePanMove); window.addEventListener('mouseup', handlePanEnd); previewNode.addEventListener('touchmove', handlePanMove, { passive: false }); previewNode.addEventListener('touchend', handlePanEnd); previewNode.addEventListener('touchcancel', handlePanEnd); const wheelListener = (event: WheelEvent) => handleWheelZoom(event); previewNode.addEventListener('wheel', wheelListener, { passive: false }); return () => { window.removeEventListener('mousemove', handlePanMove); window.removeEventListener('mouseup', handlePanEnd); if (previewNode) { previewNode.removeEventListener('touchmove', handlePanMove); previewNode.removeEventListener('touchend', handlePanEnd); previewNode.removeEventListener('touchcancel', handlePanEnd); previewNode.removeEventListener('wheel', wheelListener); } }; }, [handlePanMove, handlePanEnd, handleWheelZoom]);

  const controlsDisabled = !pdfDocProxy || (totalPhysicalSheetsPreview === 0 && (previewPageInfo?.pageCount ?? 0) > 0) || isPdfJsDocLoading || !!previewPageInfo?.error || isMainProcessLoading;
  let cursorStyle = 'default'; if (isPanning) cursorStyle = 'grabbing'; else if (isContentPannable) cursorStyle = 'grab';
  
  const impositionSettingsForThumbnail: ImpositionSettingsForThumbnail | null = useMemo(() => {
    if (!previewPageInfo) return null;
    return { selectedSheet, columns, rows, bleedInches, horizontalGutterInches, verticalGutterInches, impositionType, sheetOrientation, isDuplex, previewPageInfo, rowOffsetType, alternateRotationType };
  }, [ selectedSheet, columns, rows, bleedInches, horizontalGutterInches, verticalGutterInches, impositionType, sheetOrientation, isDuplex, previewPageInfo, rowOffsetType, alternateRotationType ]);

  // --- Virtualized List Calculations ---
  const startIndex = Math.max(0, Math.floor(listScrollTop / THUMBNAIL_LIST_ITEM_HEIGHT_PX) - OVERSCAN_COUNT);
  const visibleItemsCount = listContainerHeight > 0 ? Math.ceil(listContainerHeight / THUMBNAIL_LIST_ITEM_HEIGHT_PX) : 0;
  const endIndex = Math.min(
    sheetContextItems.length - 1,
    startIndex + visibleItemsCount + OVERSCAN_COUNT * 2 // Render items in window + overscan on both sides
  );
  const itemsToRender = sheetContextItems.slice(startIndex, endIndex + 1);
  // --- End Virtualized List Calculations ---

  return (
    <div className="w-full h-full flex flex-row gap-4">
      {/* Sheet Context List (Left Column) - Virtualized */}
      {pdfDocProxy && totalPhysicalSheetsPreview > 0 && (
        <div 
          ref={thumbnailScrollContainerRef}
          onScroll={handleThumbnailScroll}
          className="w-36 flex-shrink-0 bg-gray-50 border border-gray-200 rounded-md overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 relative max-h-[720px]" // relative needed for absolute children
        >
          {/* Sizer div for total scroll height */}
          <div style={{ position: 'relative', height: `${sheetContextItems.length * THUMBNAIL_LIST_ITEM_HEIGHT_PX}px` }}>
            {impositionSettingsForThumbnail && itemsToRender.map((item, indexInSlice) => {
              const actualItemIndex = startIndex + indexInSlice; // Original index in sheetContextItems
              return (
                <SheetContextListItem
                  key={item.key}
                  // No ref needed here for scrollIntoView as parent handles it
                  style={{
                    position: 'absolute',
                    top: `${actualItemIndex * THUMBNAIL_LIST_ITEM_HEIGHT_PX}px`,
                    left: 0,
                    right: 0,
                    height: `${THUMBNAIL_LIST_ITEM_HEIGHT_PX}px`,
                    padding: '0.5rem', // Match old p-2 from button, apply to wrapper
                  }}
                  item={item}
                  isActive={item.sheetNumber0Based === currentPhysicalSheet0Based && item.isFront === currentSideIsFront}
                  onSelect={handleContextSheetSelect}
                  pdfJsDoc={pdfDocProxy}
                  getCachedPage={getCachedPage}
                  impositionSettings={impositionSettingsForThumbnail}
                  scrollContainerRef={thumbnailScrollContainerRef} 
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Main Preview Area (Right Column) */}
      <div className="flex-grow flex flex-col min-w-0 h-full"> {/* Added h-full */}
        <div className="flex items-center justify-between p-2 border-b bg-gray-50 rounded-t-md flex-wrap gap-2">
          <div className="flex items-center space-x-1">
              <button onClick={handleSkipToFirstSheet} disabled={controlsDisabled || (currentPhysicalSheet0Based === 0 && currentSideIsFront)} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Skip to First" title="Skip to First"> <Icon iconName="chevronsLeft" className="h-5 w-5" /> </button>
              <button onClick={handlePreviousSheet} disabled={controlsDisabled || (currentPhysicalSheet0Based === 0 && currentSideIsFront)} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Previous" title="Previous"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg> </button>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-700">
              <span> Sheet: {totalPhysicalSheetsPreview > 0 ? currentPhysicalSheet0Based + 1 : 0}{isDuplex && totalPhysicalSheetsPreview > 0 ? (currentSideIsFront ? 'F' : 'B') : ''} / {totalPhysicalSheetsPreview} </span>
              <input 
                type="text" 
                value={jumpToSheetInput} 
                onChange={(e) => setJumpToSheetInput(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && handleJumpToSheet()} 
                className="w-16 px-2 py-1 border border-slate-500 bg-slate-700 text-white rounded-md text-sm disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-400 placeholder-slate-300 focus:ring-indigo-500 focus:border-indigo-500" 
                placeholder="e.g. 5F" 
                disabled={controlsDisabled}
              />
              <button onClick={handleJumpToSheet} disabled={controlsDisabled || !jumpToSheetInput.trim()} className="px-3 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:bg-gray-300">Go</button>
          </div>
          <div className="flex items-center space-x-1">
              <button onClick={handleNextSheet} disabled={controlsDisabled || (currentPhysicalSheet0Based >= totalPhysicalSheetsPreview - 1 && (isDuplex ? !currentSideIsFront : true))} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Next" title="Next"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg> </button>
              <button onClick={handleSkipToLastSheet} disabled={controlsDisabled || (currentPhysicalSheet0Based >= totalPhysicalSheetsPreview - 1 && (isDuplex ? !currentSideIsFront : true)) || totalPhysicalSheetsPreview === 0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Skip to Last" title="Skip to Last"> <Icon iconName="chevronsRight" className="h-5 w-5" /> </button>
          </div>
          <div className="flex items-center space-x-1 border-l pl-2 ml-2">
              <button onClick={handleZoomOut} disabled={controlsDisabled || zoomLevel <= MIN_ZOOM_LEVEL} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Zoom Out" title="Zoom Out"> <Icon iconName="zoomOut" className="h-5 w-5" /> </button>
              <button onClick={handleZoomReset} disabled={controlsDisabled || zoomLevel === 1.0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Reset Zoom" title="Reset Zoom"> <Icon iconName="refreshCcw" className="h-5 w-5" /> </button>
              <button onClick={handleZoomIn} disabled={controlsDisabled || zoomLevel >= MAX_ZOOM_LEVEL} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" aria-label="Zoom In" title="Zoom In"> <Icon iconName="zoomIn" className="h-5 w-5" /> </button>
              <span className="text-xs text-gray-600 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
          </div>
        </div>
        <div 
          ref={previewAreaRef}
          className="flex-grow w-full min-h-0 bg-gray-100 border-gray-200 rounded-b-md flex items-center justify-center p-2 overflow-hidden relative touch-none" // Added min-h-0
          style={{ cursor: cursorStyle }}
          onMouseDown={handlePanStart} onTouchStart={handlePanStart}
          aria-live="polite" aria-atomic="true"
        >
          {isPdfJsDocLoading && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex flex-col items-center justify-center z-10 pointer-events-none" aria-hidden="true">
              <Icon iconName="spinner" className="h-8 w-8 text-indigo-600 mb-2"/>
              <p className="text-gray-600 text-sm"> {previewPageInfo?.error ? 'Error loading PDF' : 'Loading PDF...'} </p>
            </div>
          )}
          <canvas ref={canvasRef} width="400" height="300" className="max-w-full max-h-full object-contain" aria-label="PDF Imposition Layout Preview" role="img" ></canvas>
        </div>
      </div>
    </div>
  );
};

export default PdfPreview;