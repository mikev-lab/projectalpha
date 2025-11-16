import { useState, useCallback, useEffect, useRef } from 'react';
import { SheetConfig, ImpositionType, SheetOrientation, JobInfoState, SlipSheetColorName } from '../types';
import {
    INCH_TO_POINTS, CROP_MARK_LENGTH_POINTS, CROP_MARK_OFFSET_POINTS, CROP_MARK_THICKNESS_POINTS,
    SLUG_AREA_MARGIN_POINTS, QR_CODE_SIZE_POINTS, SLUG_TEXT_FONT_SIZE_POINTS, SLUG_TEXT_QR_PADDING_POINTS,
    SLUG_AREA_BOTTOM_Y_POINTS, QR_GENERATION_PIXEL_SIZE, QR_SLUG_SHIFT_RIGHT_POINTS,
    SLIP_SHEET_COLORS
} from '../constants';
import { PDFDocument, PDFPage, PDFFont, PDFImage, StandardFonts, cmyk, rgb, degrees } from 'pdf-lib';
import QRious from 'qrious';

interface UsePdfImpositionResult {
  imposePdf: () => Promise<void>;
  outputPdfUrl: string | null;
  isLoading: boolean;
  error: string | null;
  message: string | null;
  clearOutput: () => void;
  impositionProgress: number; // New progress state
}

// Helper to convert base64 data URL to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function formatDateForSlug(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
         // Adjust for timezone offset to ensure correct date part is used
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() + userTimezoneOffset);

        const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
        const day = localDate.getDate().toString().padStart(2, '0');
        const year = localDate.getFullYear().toString().slice(-2);
        return `${month}/${day}/${year}`;
    } catch (e) {
        return dateString; // return original if parsing fails
    }
}

const drawSpineIndicator = (
  page: PDFPage,
  trimAreaX: number,
  trimAreaY: number,
  trimAreaWidth: number,
  trimAreaHeight: number,
  isSpineOnLeft: boolean,
  font: PDFFont
) => {
  const registrationBlack = cmyk(1, 1, 1, 1);

  const TRIANGLE_HEIGHT = 5;
  const TRIANGLE_BASE = 7;
  const TEXT_SIZE = 5;
  const TEXT_OFFSET_Y = 1;
  const INDICATOR_OFFSET_FROM_CROP = 5;

  const indicatorY = trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS + INDICATOR_OFFSET_FROM_CROP;
  const xCenter = isSpineOnLeft ? trimAreaX : trimAreaX + trimAreaWidth;

  // Draw triangle pointing down
  const p1 = { x: xCenter - TRIANGLE_BASE / 2, y: indicatorY };
  const p2 = { x: xCenter + TRIANGLE_BASE / 2, y: indicatorY };
  const p3 = { x: xCenter, y: indicatorY - TRIANGLE_HEIGHT };
  const lineOptions = { thickness: CROP_MARK_THICKNESS_POINTS, color: registrationBlack };
  page.drawLine({ start: p1, end: p2, ...lineOptions });
  page.drawLine({ start: p2, end: p3, ...lineOptions });
  page.drawLine({ start: p3, end: p1, ...lineOptions });

  // Draw "SPINE" text above triangle
  const text = "SPINE";
  const textWidth = font.widthOfTextAtSize(text, TEXT_SIZE);
  page.drawText(text, {
    x: xCenter - textWidth / 2,
    y: indicatorY + TEXT_OFFSET_Y,
    font,
    size: TEXT_SIZE,
    color: registrationBlack,
  });
};

const drawSpineSlugText = (
  page: PDFPage,
  trimAreaX: number,
  trimAreaY: number,
  trimAreaWidth: number,
  trimAreaHeight: number,
  isSpineOnLeft: boolean,
  isFrontSide: boolean,
  bleedPoints: number, // New parameter
  font: PDFFont
) => {
  const registrationBlack = cmyk(1, 1, 1, 1);
  const TEXT_SIZE = 5;

  // Set the repeating text to be explicit: "FRONT SPINE" or "BACK SPINE"
  const label = isFrontSide ? 'FRONT SPINE' : 'BACK SPINE';
  const repeatingPart = ' - ' + label;

  const labelWidth = font.widthOfTextAtSize(label, TEXT_SIZE);
  const repeatingPartWidth = font.widthOfTextAtSize(repeatingPart, TEXT_SIZE);
  const availableHeight = trimAreaHeight - 2; // a little margin

  let text = label;
  if (repeatingPartWidth > 0) {
    // Start with the initial label, see how many more repeating parts can fit
    const remainingHeight = availableHeight - labelWidth;
    const numRepeats = Math.floor(remainingHeight / repeatingPartWidth);
    if (numRepeats > 0) {
        text += repeatingPart.repeat(Math.min(numRepeats, 200)); // Cap repeats for performance
    }
  }

  let x: number;
  const y: number = trimAreaY;

  // The crop mark offset provides a standard gap from an edge. We will place the text
  // outside the bleed area using this standard gap to ensure it's always in the slug.
  const gapFromBleedEdge = CROP_MARK_OFFSET_POINTS;

  if (isSpineOnLeft) {
    // Bleed edge is at (trimAreaX - bleedPoints). Position text to the left of that.
    // The rotation point 'x' is the bottom-left of the unrotated text box.
    // After rotation, the right edge of the text will be at 'x + TEXT_SIZE'.
    // We want the right edge to be at (trimAreaX - bleedPoints - gapFromBleedEdge).
    // So, x = trimAreaX - bleedPoints - gapFromBleedEdge - TEXT_SIZE
    x = trimAreaX - bleedPoints - gapFromBleedEdge - TEXT_SIZE;
  } else {
    // Bleed edge is at (trimAreaX + trimAreaWidth + bleedPoints). Position text to the right of that.
    // The rotation point 'x' is the left edge of the rotated text.
    // We want the left edge to be at (trimAreaX + trimAreaWidth + bleedPoints + gapFromBleedEdge).
    x = trimAreaX + trimAreaWidth + bleedPoints + gapFromBleedEdge;
  }

  page.drawText(text, {
    x,
    y,
    font,
    size: TEXT_SIZE,
    color: registrationBlack,
    rotate: { angle: 90, type: 'degrees' },
  });
};


export const usePdfImposition = (params: ImpositionParams): UsePdfImpositionResult => {
  const {
    inputFile,
    selectedSheet,
    columns,
    rows,
    bleedInches,
    horizontalGutterInches,
    verticalGutterInches,
    impositionType,
    sheetOrientation,
    clientName, // Legacy client name
    includeInfo,
    isDuplex,
    jobInfo, // Detailed job information
    addFirstSheetSlip,
    firstSheetSlipColor,
    readingDirection,
    showSpineMarks,
    rowOffsetType,
    alternateRotationType,
    creepInches,
    isLargeFile,
  } = params;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [outputPdfUrl, setOutputPdfUrl] = useState<string | null>(null);
  const [impositionProgress, setImpositionProgress] = useState<number>(0); // New state for progress

  const currentOutputUrlRef = useRef<string | null>(null);

  useEffect(() => {
    currentOutputUrlRef.current = outputPdfUrl;
  }, [outputPdfUrl]);

  useEffect(() => {
    const urlToRevokeOnUnmount = currentOutputUrlRef.current;
    return () => {
      if (urlToRevokeOnUnmount) {
        URL.revokeObjectURL(urlToRevokeOnUnmount);
      }
    };
  }, []);


  const clearOutput = useCallback(() => {
    if (currentOutputUrlRef.current) {
        URL.revokeObjectURL(currentOutputUrlRef.current);
        currentOutputUrlRef.current = null;
    }
    setOutputPdfUrl(null);
    setError(null);
    setMessage(null);
    setImpositionProgress(0); // Reset progress
  }, []);

  const drawCropMarks = (
    page: PDFPage,
    trimAreaX: number,
    trimAreaY: number,
    trimAreaWidth: number,
    trimAreaHeight: number,
    options: {
      hasTopNeighbor?: boolean;
      hasBottomNeighbor?: boolean;
      hasLeftNeighbor?: boolean;
      hasRightNeighbor?: boolean;
    } = {}
  ) => {
    const registrationBlack = cmyk(1, 1, 1, 1);
    const commonOptions = { thickness: CROP_MARK_THICKNESS_POINTS, color: registrationBlack };

    const { hasTopNeighbor, hasBottomNeighbor, hasLeftNeighbor, hasRightNeighbor } = options;

    // TOP EDGE MARKS (vertical lines pointing up)
    if (!hasTopNeighbor) {
      // Top-left
      page.drawLine({ start: { x: trimAreaX, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS }, ...commonOptions });
      // Top-right
      page.drawLine({ start: { x: trimAreaX + trimAreaWidth, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX + trimAreaWidth, y: trimAreaY + trimAreaHeight + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS }, ...commonOptions });
    }

    // BOTTOM EDGE MARKS (vertical lines pointing down)
    if (!hasBottomNeighbor) {
      // Bottom-left
      page.drawLine({ start: { x: trimAreaX, y: trimAreaY - CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX, y: trimAreaY - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS }, ...commonOptions });
      // Bottom-right
      page.drawLine({ start: { x: trimAreaX + trimAreaWidth, y: trimAreaY - CROP_MARK_OFFSET_POINTS }, end: { x: trimAreaX + trimAreaWidth, y: trimAreaY - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS }, ...commonOptions });
    }

    // LEFT EDGE MARKS (horizontal lines pointing left)
    if (!hasLeftNeighbor) {
      // Top-left
      page.drawLine({ start: { x: trimAreaX - CROP_MARK_OFFSET_POINTS, y: trimAreaY + trimAreaHeight }, end: { x: trimAreaX - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS, y: trimAreaY + trimAreaHeight }, ...commonOptions });
      // Bottom-left
      page.drawLine({ start: { x: trimAreaX - CROP_MARK_OFFSET_POINTS, y: trimAreaY }, end: { x: trimAreaX - CROP_MARK_OFFSET_POINTS - CROP_MARK_LENGTH_POINTS, y: trimAreaY }, ...commonOptions });
    }

    // RIGHT EDGE MARKS (horizontal lines pointing right)
    if (!hasRightNeighbor) {
      // Top-right
      page.drawLine({ start: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS, y: trimAreaY + trimAreaHeight }, end: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS, y: trimAreaY + trimAreaHeight }, ...commonOptions });
      // Bottom-right
      page.drawLine({ start: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS, y: trimAreaY }, end: { x: trimAreaX + trimAreaWidth + CROP_MARK_OFFSET_POINTS + CROP_MARK_LENGTH_POINTS, y: trimAreaY }, ...commonOptions });
    }
  };

  const drawSlugInfo = async (
    page: PDFPage,
    pdfDoc: PDFDocument,
    currentSheetId: string, // e.g., "1F", "1B"
    totalSheetsForSlug: number,
    font: PDFFont,
    xShiftPoints: number
  ) => {
    const black = rgb(0, 0, 0);

    const qrX = SLUG_AREA_MARGIN_POINTS + xShiftPoints;
    const qrY = SLUG_AREA_BOTTOM_Y_POINTS;

    // Construct Slug Text - Prioritize JobInfo
    const trimSize = (jobInfo.finalTrimWidth && jobInfo.finalTrimHeight)
                     ? `${jobInfo.finalTrimWidth}x${jobInfo.finalTrimHeight}`
                     : 'N/A';
    const dueDateSlug = formatDateForSlug(jobInfo.dueDate);
    const qty = jobInfo.quantity || 'N/A';
    const jobName = jobInfo.jobIdName || (jobInfo.fileNameTitle || inputFile.name.substring(0, inputFile.name.lastIndexOf('.')) || "Job");

    const slugText = `Sheet: ${currentSheetId} of ${totalSheetsForSlug} | Job: ${jobName.substring(0,20)} | Qty: ${qty} | Due: ${dueDateSlug} | Trim: ${trimSize}`;

    // Construct QR Data - More comprehensive
    let qrData = `Sheet: ${currentSheetId}/${totalSheetsForSlug}\n`;
    qrData += `JobID: ${jobInfo.jobIdName || 'N/A'}\n`;
    qrData += `Customer: ${jobInfo.customerName || 'N/A'}\n`;
    qrData += `Contact: ${jobInfo.contactInfo || 'N/A'}\n`;
    qrData += `File: ${jobInfo.fileNameTitle || inputFile.name}\n`;
    qrData += `Qty: ${jobInfo.quantity || 'N/A'}\n`;
    qrData += `Due: ${dueDateSlug}\n`;
    qrData += `Trim: ${trimSize}\n`;
    qrData += `IntPrint: ${jobInfo.interiorPrintType || 'N/A'}\n`;
    qrData += `IntPaper: ${jobInfo.interiorPaperQuick || 'N/A'} ${jobInfo.interiorPaperWeight || ''}\n`;
    qrData += `CovPrint: ${jobInfo.coverPrintType || 'N/A'}\n`;
    qrData += `CovPaper: ${jobInfo.coverPaperQuick || 'N/A'} ${jobInfo.coverPaperWeight || ''}\n`;
    qrData += `Finish: ${jobInfo.finishType || 'N/A'}\n`;
    qrData += `Binding: ${jobInfo.bindingType || 'N/A'}\n`;
    qrData += `Notes: ${jobInfo.urgentNotes || 'N/A'}`;


    try {
      const qr = new QRious({
        value: qrData,
        size: QR_GENERATION_PIXEL_SIZE,
        level: 'M',
        padding: 0,
      });
      const qrDataURL = qr.toDataURL('image/png');

      const base64Data = qrDataURL.substring(qrDataURL.indexOf(',') + 1);
      const qrPngBytes = base64ToUint8Array(base64Data);

      const qrImage: PDFImage = await pdfDoc.embedPng(qrPngBytes);

      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: QR_CODE_SIZE_POINTS,
        height: QR_CODE_SIZE_POINTS,
      });

    } catch (qrError) {
      console.error("Failed to generate or embed QR code:", qrError);
      page.drawRectangle({
        x: qrX,
        y: qrY,
        width: QR_CODE_SIZE_POINTS,
        height: QR_CODE_SIZE_POINTS,
        borderColor: black,
        borderWidth: 0.5,
        color: rgb(0.9, 0.9, 0.9)
      });
      const errorText = "QR ERR";
      const errorTextWidth = font.widthOfTextAtSize(errorText, SLUG_TEXT_FONT_SIZE_POINTS - 1);
      const fontHeightError = font.heightAtSize(SLUG_TEXT_FONT_SIZE_POINTS-1);
      page.drawText(errorText, {
          x: qrX + (QR_CODE_SIZE_POINTS - errorTextWidth) / 2,
          y: qrY + (QR_CODE_SIZE_POINTS - fontHeightError) / 2 + fontHeightError * 0.15,
          size: SLUG_TEXT_FONT_SIZE_POINTS - 1,
          font: font,
          color: black,
      });
    }

    const textX = qrX + QR_CODE_SIZE_POINTS + SLUG_TEXT_QR_PADDING_POINTS;
    const fontHeight = font.heightAtSize(SLUG_TEXT_FONT_SIZE_POINTS);
    const textBaselineY = qrY + (QR_CODE_SIZE_POINTS / 2) - (fontHeight / 2) + (fontHeight * 0.15);

    // Truncate slugText if too long for page width (approx)
    const maxSlugWidth = page.getWidth() - textX - SLUG_AREA_MARGIN_POINTS;
    let displaySlugText = slugText;
    if (font.widthOfTextAtSize(slugText, SLUG_TEXT_FONT_SIZE_POINTS) > maxSlugWidth) {
        while (font.widthOfTextAtSize(displaySlugText + "...", SLUG_TEXT_FONT_SIZE_POINTS) > maxSlugWidth && displaySlugText.length > 0) {
            displaySlugText = displaySlugText.slice(0, -1);
        }
        displaySlugText += "...";
    }


    page.drawText(displaySlugText, {
      x: textX,
      y: textBaselineY,
      size: SLUG_TEXT_FONT_SIZE_POINTS,
      font: font,
      color: black,
    });
  };

  const imposePdf = useCallback(async () => {
    if (!inputFile) {
      setError("Please select a PDF file.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);
    setImpositionProgress(0);
    clearOutput();

    const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
    const bleedPoints = bleedInches * INCH_TO_POINTS;
    const horizontalGutterPoints = horizontalGutterInches * INCH_TO_POINTS;
    const verticalGutterPoints = verticalGutterInches * INCH_TO_POINTS;
    const whiteColor = rgb(1, 1, 1);

    try {
      setImpositionProgress(1);
      const fileBytes = await inputFile.arrayBuffer();
      const inputPdfDoc = await PDFDocument.load(fileBytes);
      const numInputPages = inputPdfDoc.getPageCount();
      if (numInputPages === 0) throw new Error("The uploaded PDF has no pages.");
      setImpositionProgress(5);

      const inputPages = inputPdfDoc.getPages();
      const sizingReferencePage = inputPages[0];
      const { width: uploadedDocPageWidthRef, height: uploadedDocPageHeightRef } = sizingReferencePage.getSize();
      if (uploadedDocPageWidthRef <= 0 || uploadedDocPageHeightRef <= 0) throw new Error("Reference page has invalid dimensions.");

      // 1. Calculate total output sheets
      let slotsPerSheet = columns * rows;
      if (impositionType === 'booklet') {
          slotsPerSheet = 2; // Booklets are always 2-up
      }

      let totalPhysicalSheets = 0;
      let paddedPageCount = numInputPages; // for booklet

      if (impositionType === 'booklet') {
          paddedPageCount = Math.ceil(numInputPages / 4) * 4;
          totalPhysicalSheets = paddedPageCount / 4;
      } else if (impositionType === 'repeat') {
          totalPhysicalSheets = isDuplex ? Math.ceil(numInputPages / 2) : numInputPages;
      } else if (impositionType === 'stack') {
          const slotsPerPhysicalSheet = slotsPerSheet * (isDuplex ? 2 : 1);
          totalPhysicalSheets = Math.ceil(numInputPages / slotsPerPhysicalSheet);
      } else { // collateCut
          const pagesPerLogicalStack = Math.ceil(numInputPages / slotsPerSheet);
          totalPhysicalSheets = isDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack;
      }
      if (totalPhysicalSheets === 0 && numInputPages > 0) totalPhysicalSheets = 1;

      // 2. Determine chunking behavior. Chunking is triggered by large input file size.
      // The chunk size itself is determined by a maximum number of output sheets per part
      // to keep individual file sizes manageable.
      const MAX_PAGES_PER_CHUNK_REPEAT = 50;
      const MAX_PAGES_PER_CHUNK_GENERAL = 100;

      const pageLimit = impositionType === 'repeat'
          ? MAX_PAGES_PER_CHUNK_REPEAT
          : MAX_PAGES_PER_CHUNK_GENERAL;

      // Each sheet results in 2 PDF pages if duplex, otherwise 1 page.
      // This calculates the max number of SHEETS we can process in one chunk.
      const sheetsPerChunk = isDuplex ? Math.floor(pageLimit / 2) : pageLimit;

      const needsChunking = !!isLargeFile;

      const totalChunks = needsChunking ? Math.ceil(totalPhysicalSheets / sheetsPerChunk) : 1;
      const downloadFileNameBase = jobInfo.fileNameTitle || inputFile.name.replace(/\.pdf$/i, '') || 'imposed_output';

      // 3. Calculate sheet dimensions and slot positions
      const paperLongSidePoints = selectedSheet.longSideInches * INCH_TO_POINTS;
      const paperShortSidePoints = selectedSheet.shortSideInches * INCH_TO_POINTS;
      let actualSheetWidthPoints: number, actualSheetHeightPoints: number;

      if (sheetOrientation === 'portrait') {
        actualSheetWidthPoints = paperShortSidePoints; actualSheetHeightPoints = paperLongSidePoints;
      } else if (sheetOrientation === 'landscape') {
        actualSheetWidthPoints = paperLongSidePoints; actualSheetHeightPoints = paperShortSidePoints;
      } else {
        let contentBlockRenderWidth = (uploadedDocPageWidthRef * columns) + (Math.max(0, columns - 1) * horizontalGutterPoints);
        if (rowOffsetType === 'half' && rows > 1) contentBlockRenderWidth += (uploadedDocPageWidthRef + horizontalGutterPoints) / 2;
        let contentBlockRenderHeight = (uploadedDocPageHeightRef * rows) + (Math.max(0, rows - 1) * verticalGutterPoints);
        const canFitLandscape = contentBlockRenderWidth <= paperLongSidePoints && contentBlockRenderHeight <= paperShortSidePoints;
        const canFitPortrait = contentBlockRenderWidth <= paperShortSidePoints && contentBlockRenderHeight <= paperLongSidePoints;
        if (canFitLandscape && canFitPortrait) {
            actualSheetWidthPoints = (contentBlockRenderWidth / paperLongSidePoints > contentBlockRenderHeight / paperShortSidePoints) ? paperLongSidePoints : paperShortSidePoints;
            actualSheetHeightPoints = (contentBlockRenderWidth / paperLongSidePoints > contentBlockRenderHeight / paperShortSidePoints) ? paperShortSidePoints : paperLongSidePoints;
        } else if (canFitLandscape) {
            actualSheetWidthPoints = paperLongSidePoints; actualSheetHeightPoints = paperShortSidePoints;
        } else if (canFitPortrait) {
            actualSheetWidthPoints = paperShortSidePoints; actualSheetHeightPoints = paperLongSidePoints;
        } else {
            throw new Error(`Auto-orientation failed: Content block too large for selected paper.`);
        }
      }

      const layoutCellWidth = uploadedDocPageWidthRef;
      const layoutCellHeight = uploadedDocPageHeightRef;
      const currentColumnsForLayout = impositionType === 'booklet' ? 2 : columns;
      const currentRowsForLayout = impositionType === 'booklet' ? 1 : rows;

      const slotPositions: { x: number, y: number }[] = [];
      let totalRequiredWidth = (layoutCellWidth * currentColumnsForLayout) + (Math.max(0, currentColumnsForLayout - 1) * horizontalGutterPoints);
      const totalRequiredHeight = (layoutCellHeight * currentRowsForLayout) + (Math.max(0, currentRowsForLayout - 1) * verticalGutterPoints);
      if (rowOffsetType === 'half' && currentRowsForLayout > 1) {
          totalRequiredWidth += (layoutCellWidth + horizontalGutterPoints) / 2;
      }
      const startXBlock = (actualSheetWidthPoints - totalRequiredWidth) / 2;
      const startYBlock = (actualSheetHeightPoints - totalRequiredHeight) / 2;
      if (startXBlock < 0 || startYBlock < 0) throw new Error(`Content (${currentColumnsForLayout}x${currentRowsForLayout} grid) too large for sheet.`);

      for (let row = 0; row < currentRowsForLayout; row++) {
        for (let col = 0; col < currentColumnsForLayout; col++) {
          let xPos = startXBlock + col * (layoutCellWidth + horizontalGutterPoints);
          const yPos = startYBlock + (currentRowsForLayout - 1 - row) * (layoutCellHeight + verticalGutterPoints);
          if (rowOffsetType === 'half' && row % 2 !== 0) {
            xPos += (layoutCellWidth + horizontalGutterPoints) / 2;
          }
          slotPositions.push({ x: xPos, y: yPos });
        }
      }
      setImpositionProgress(10);

      // 4. Main processing loop (by chunk)
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const outputPdfDoc = await PDFDocument.create();
        outputPdfDoc.setTitle(`${downloadFileNameBase}${needsChunking ? ` (Part ${chunkIndex + 1})` : ' (Imposed)'}`);
        const helveticaFont = await outputPdfDoc.embedFont(StandardFonts.Helvetica);

        const chunkStartSheet = chunkIndex * sheetsPerChunk;
        const chunkEndSheet = needsChunking
          ? Math.min(chunkStartSheet + sheetsPerChunk, totalPhysicalSheets)
          : totalPhysicalSheets;

        // Inner loop for sheets within the chunk
        for (let physicalSheetIndex = chunkStartSheet; physicalSheetIndex < chunkEndSheet; physicalSheetIndex++) {
          const currentPhysicalSheetNumberForSlug = physicalSheetIndex + 1;
          const outputSheetFront = outputPdfDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);

          // --- Slip Sheet Logic (Front Side Only) ---
          if (addFirstSheetSlip && physicalSheetIndex === 0) {
            const selectedColorObj = SLIP_SHEET_COLORS.find(c => c.name === firstSheetSlipColor);
            const slipColorRgb = selectedColorObj ? selectedColorObj.pdfRgb : SLIP_SHEET_COLORS.find(c=>c.name==='Grey')!.pdfRgb;
            const slipColor = rgb(slipColorRgb[0], slipColorRgb[1], slipColorRgb[2]);
            outputSheetFront.drawRectangle({ x: 0, y: 0, width: actualSheetWidthPoints, height: actualSheetHeightPoints, color: slipColor });
            for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                outputSheetFront.drawRectangle({ x: slotPositions[slotIndex].x, y: slotPositions[slotIndex].y, width: layoutCellWidth, height: layoutCellHeight, color: whiteColor });
            }
            if (includeInfo) {
                const slugMaskHeight = QR_CODE_SIZE_POINTS;
                outputSheetFront.drawRectangle({ x: SLUG_AREA_MARGIN_POINTS, y: SLUG_AREA_BOTTOM_Y_POINTS, width: actualSheetWidthPoints - (2 * SLUG_AREA_MARGIN_POINTS), height: slugMaskHeight, color: whiteColor });
            }
          }

          // --- Booklet Logic ---
          if (impositionType === 'booklet') {
            const numSheets = paddedPageCount / 4;
            const totalCreepPoints = creepInches * INCH_TO_POINTS;
            const creepPerSheetStep = (numSheets > 1) ? totalCreepPoints / (numSheets - 1) : 0;
            const creepForThisSheet = physicalSheetIndex * creepPerSheetStep;

            const pageIndexFR = physicalSheetIndex * 2;
            const pageIndexFL = paddedPageCount - (physicalSheetIndex * 2) - 1;
            const pageIndexBL = physicalSheetIndex * 2 + 1;
            const pageIndexBR = paddedPageCount - (physicalSheetIndex * 2) - 2;

            const pagesForFront = [inputPages[pageIndexFL], inputPages[pageIndexFR]];
            const pagesForBack = [inputPages[pageIndexBL], inputPages[pageIndexBR]];

            // Draw front side
            for(let i=0; i < pagesForFront.length; i++) {
                const isLeftPage = i === 0;
                const pageToEmbed = pagesForFront[i];
                if (!pageToEmbed) continue;
                const embeddedPage = await outputPdfDoc.embedPage(pageToEmbed);
                const creepOffset = (isLeftPage ? -1 : 1) * (creepForThisSheet / 2);
                outputSheetFront.drawPage(embeddedPage, { x: slotPositions[i].x + creepOffset, y: slotPositions[i].y, width: layoutCellWidth, height: layoutCellHeight });
                const trimAreaX = slotPositions[i].x + bleedPoints + creepOffset;
                const trimAreaY = slotPositions[i].y + bleedPoints;
                const trimAreaWidth = layoutCellWidth - (2 * bleedPoints);
                const trimAreaHeight = layoutCellHeight - (2 * bleedPoints);
                drawCropMarks(outputSheetFront, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, { hasRightNeighbor: isLeftPage, hasLeftNeighbor: !isLeftPage });
                if (showSpineMarks) {
                    const isSpineOnLeft = readingDirection === 'ltr' ? !isLeftPage : isLeftPage;
                    drawSpineSlugText(outputSheetFront, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, isSpineOnLeft, true, bleedPoints, helveticaFont);
                    if (physicalSheetIndex === 0 || physicalSheetIndex === totalPhysicalSheets - 1) {
                        drawSpineIndicator(outputSheetFront, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, isSpineOnLeft, helveticaFont);
                    }
                }
            }

            // Draw back side
            const outputSheetBack = outputPdfDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);
            for(let i=0; i < pagesForBack.length; i++) {
                const isLeftPage = i === 0;
                const pageToEmbed = pagesForBack[i];
                if (!pageToEmbed) continue;
                const embeddedPage = await outputPdfDoc.embedPage(pageToEmbed);
                const creepOffset = (isLeftPage ? -1 : 1) * (creepForThisSheet / 2);
                outputSheetBack.drawPage(embeddedPage, { x: slotPositions[i].x + creepOffset, y: slotPositions[i].y, width: layoutCellWidth, height: layoutCellHeight });
                const trimAreaX = slotPositions[i].x + bleedPoints + creepOffset;
                const trimAreaY = slotPositions[i].y + bleedPoints;
                const trimAreaWidth = layoutCellWidth - (2 * bleedPoints);
                const trimAreaHeight = layoutCellHeight - (2 * bleedPoints);
                drawCropMarks(outputSheetBack, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, { hasRightNeighbor: isLeftPage, hasLeftNeighbor: !isLeftPage });
                if (showSpineMarks) {
                    const isSpineOnLeft = readingDirection === 'ltr' ? !isLeftPage : isLeftPage;
                    drawSpineSlugText(outputSheetBack, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, isSpineOnLeft, false, bleedPoints, helveticaFont);
                    if (physicalSheetIndex === 0 || physicalSheetIndex === totalPhysicalSheets - 1) {
                        drawSpineIndicator(outputSheetBack, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, isSpineOnLeft, helveticaFont);
                    }
                }
            }
            if (includeInfo) {
                await drawSlugInfo(outputSheetFront, outputPdfDoc, `${currentPhysicalSheetNumberForSlug}F`, totalPhysicalSheets, helveticaFont, QR_SLUG_SHIFT_RIGHT_POINTS);
                await drawSlugInfo(outputSheetBack, outputPdfDoc, `${currentPhysicalSheetNumberForSlug}B`, totalPhysicalSheets, helveticaFont, QR_SLUG_SHIFT_RIGHT_POINTS);
            }
          } else { // --- Non-booklet Logic ---
            const pagesForFront: (PDFPage | null)[] = [];

            if (impositionType === 'stack') {
              const baseInputIndexForSheet = physicalSheetIndex * slotsPerSheet * (isDuplex ? 2 : 1);
              for (let i = 0; i < slotsPerSheet; i++) {
                // If duplex, interleave pages (0, 2, 4...). If not, sequential pages (0, 1, 2...).
                const pageIndex = baseInputIndexForSheet + (isDuplex ? i * 2 : i);
                pagesForFront.push(pageIndex < numInputPages ? inputPages[pageIndex] : null);
              }
            } else if (impositionType === 'repeat') {
              const masterPageFront = (physicalSheetIndex * (isDuplex ? 2 : 1) < numInputPages) ? inputPages[physicalSheetIndex * (isDuplex ? 2 : 1)] : null;
              for (let i = 0; i < slotsPerSheet; i++) pagesForFront.push(masterPageFront);
            } else { // collateCut
                const pagesPerLogicalStack = Math.ceil(numInputPages / slotsPerSheet);
                const totalSheetsForMode = isDuplex ? Math.ceil(pagesPerLogicalStack / 2) : pagesPerLogicalStack;
                const totalSlotsPerColumn = totalSheetsForMode * (isDuplex ? 2 : 1);
                const pageOffsets: number[] = Array.from({ length: slotsPerSheet }, (_, i) => i * totalSlotsPerColumn);
                const logicalPageIndexFront = physicalSheetIndex * (isDuplex ? 2 : 1);
                for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                    const pageToEmbedIndex = logicalPageIndexFront + pageOffsets[slotIndex];
                    pagesForFront.push(pageToEmbedIndex < numInputPages ? inputPages[pageToEmbedIndex] : null);
                }
            }

            for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
              const pageToEmbed = pagesForFront[slotIndex]; if (!pageToEmbed) continue;
              const embeddedPage = await outputPdfDoc.embedPage(pageToEmbed);
              const slotBaseX = slotPositions[slotIndex].x, slotBaseY = slotPositions[slotIndex].y;
              const row = Math.floor(slotIndex / columns), col = slotIndex % columns;
              let shouldRotate = alternateRotationType === 'altCol' ? col % 2 !== 0 : alternateRotationType === 'altRow' ? row % 2 !== 0 : false;
              const drawOptions: any = { x: slotBaseX, y: slotBaseY, width: layoutCellWidth, height: layoutCellHeight };
              if (shouldRotate) { drawOptions.x += layoutCellWidth; drawOptions.y += layoutCellHeight; drawOptions.rotate = degrees(180); }
              outputSheetFront.drawPage(embeddedPage, drawOptions);
              const trimAreaX = slotBaseX + bleedPoints, trimAreaY = slotBaseY + bleedPoints, trimAreaWidth = layoutCellWidth - (2*bleedPoints), trimAreaHeight = layoutCellHeight - (2*bleedPoints);
              drawCropMarks(outputSheetFront, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, { hasTopNeighbor: row > 0, hasBottomNeighbor: row < rows - 1, hasLeftNeighbor: col > 0, hasRightNeighbor: col < columns - 1 });

              if (showSpineMarks && (impositionType === 'stack' || impositionType === 'collateCut' || impositionType === 'repeat')) {
                  const baseSpineIsLeft = readingDirection === 'ltr';
                  const finalSpineIsLeft = shouldRotate ? !baseSpineIsLeft : baseSpineIsLeft;
                  drawSpineSlugText(outputSheetFront, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, finalSpineIsLeft, true, bleedPoints, helveticaFont);
              }
            }
            if (includeInfo) await drawSlugInfo(outputSheetFront, outputPdfDoc, `${currentPhysicalSheetNumberForSlug}F`, totalPhysicalSheets, helveticaFont, QR_SLUG_SHIFT_RIGHT_POINTS);

            if (isDuplex) {
              const outputSheetBack = outputPdfDoc.addPage([actualSheetWidthPoints, actualSheetHeightPoints]);
              const pagesForBack: (PDFPage | null)[] = [];
              if (impositionType === 'stack') {
                const baseInputIndexForSheet = physicalSheetIndex * slotsPerSheet * 2;
                for (let i = 0; i < slotsPerSheet; i++) {
                    // Interleaved logic for back pages (1, 3, 5...)
                    const pageIndex = baseInputIndexForSheet + (i * 2) + 1;
                    pagesForBack.push(pageIndex < numInputPages ? inputPages[pageIndex] : null);
                }
              } else if (impositionType === 'repeat') {
                const masterPageBack = ((physicalSheetIndex * 2) + 1 < numInputPages) ? inputPages[(physicalSheetIndex * 2) + 1] : null;
                for (let i = 0; i < slotsPerSheet; i++) pagesForBack.push(masterPageBack);
              } else { // collateCut
                const pagesPerLogicalStack = Math.ceil(numInputPages / slotsPerSheet);
                const totalSheetsForMode = Math.ceil(pagesPerLogicalStack / 2);
                const totalSlotsPerColumn = totalSheetsForMode * 2;
                const pageOffsets: number[] = Array.from({ length: slotsPerSheet }, (_, i) => i * totalSlotsPerColumn);
                const logicalPageIndexBack = (physicalSheetIndex * 2) + 1;
                for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                    const pageToEmbedIndex = logicalPageIndexBack + pageOffsets[slotIndex];
                    pagesForBack.push(pageToEmbedIndex < numInputPages ? inputPages[pageToEmbedIndex] : null);
                }
              }

              if (pagesForBack.some(p=>p)) {
                let pagesForBackToRender = pagesForBack;
                // For work-and-turn, reverse pages within each row for back side placement
                if ((impositionType === 'stack' || impositionType === 'collateCut') && columns > 1) {
                    const reversedRows = [];
                    for (let row = 0; row < rows; row++) {
                        const rowSlice = pagesForBack.slice(row * columns, (row + 1) * columns);
                        reversedRows.push(...rowSlice.reverse());
                    }
                    pagesForBackToRender = reversedRows;
                }

                for (let slotIndex = 0; slotIndex < slotsPerSheet; slotIndex++) {
                  const pageToEmbed = pagesForBackToRender[slotIndex]; if (!pageToEmbed) continue;
                  const embeddedPage = await outputPdfDoc.embedPage(pageToEmbed);
                  const slotBaseX = slotPositions[slotIndex].x, slotBaseY = slotPositions[slotIndex].y;
                  const row = Math.floor(slotIndex / columns), col = slotIndex % columns;
                  let shouldRotate = alternateRotationType === 'altCol' ? col % 2 !== 0 : alternateRotationType === 'altRow' ? row % 2 !== 0 : false;
                  const drawOptions: any = { x: slotBaseX, y: slotBaseY, width: layoutCellWidth, height: layoutCellHeight };
                  if (shouldRotate) { drawOptions.x += layoutCellWidth; drawOptions.y += layoutCellHeight; drawOptions.rotate = degrees(180); }
                  outputSheetBack.drawPage(embeddedPage, drawOptions);
                  const trimAreaX = slotBaseX + bleedPoints, trimAreaY = slotBaseY + bleedPoints, trimAreaWidth = layoutCellWidth - (2*bleedPoints), trimAreaHeight = layoutCellHeight - (2*bleedPoints);
                  drawCropMarks(outputSheetBack, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, { hasTopNeighbor: row > 0, hasBottomNeighbor: row < rows - 1, hasLeftNeighbor: col > 0, hasRightNeighbor: col < columns - 1 });

                  if (showSpineMarks && (impositionType === 'stack' || impositionType === 'collateCut' || impositionType === 'repeat')) {
                      // For work-and-turn, the spine side flips on the back.
                      const baseSpineIsLeft = readingDirection !== 'ltr';
                      const finalSpineIsLeft = shouldRotate ? !baseSpineIsLeft : baseSpineIsLeft;
                      drawSpineSlugText(outputSheetBack, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, finalSpineIsLeft, false, bleedPoints, helveticaFont);
                  }
                }
              }
              if (includeInfo) await drawSlugInfo(outputSheetBack, outputPdfDoc, `${currentPhysicalSheetNumberForSlug}B`, totalPhysicalSheets, helveticaFont, QR_SLUG_SHIFT_RIGHT_POINTS);
            }
          }

          const baseProgress = (chunkIndex / totalChunks) * 90;
          const chunkProgress = ((physicalSheetIndex - chunkStartSheet + 1) / (chunkEndSheet - chunkStartSheet)) * (90 / totalChunks);
          setImpositionProgress(Math.round(10 + baseProgress + chunkProgress));
        }

        // 5. Save and download current chunk
        setImpositionProgress(Math.round(10 + ((chunkIndex + 1) / totalChunks) * 90 - 2)); // Progress before save
        const pdfBytes = await outputPdfDoc.save();
        if (!pdfBytes || pdfBytes.length === 0) throw new Error(`Generated PDF for chunk ${chunkIndex + 1} is empty.`);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = needsChunking
          ? `${downloadFileNameBase}_part_${chunkIndex + 1}_of_${totalChunks}.pdf`
          : `${downloadFileNameBase}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (!needsChunking) {
          setOutputPdfUrl(url); // For single file, keep URL for preview
          currentOutputUrlRef.current = url;
        } else {
          URL.revokeObjectURL(url); // For chunks, revoke immediately
        }
      }

      if (needsChunking) {
        setMessage(`Successfully downloaded ${totalChunks} parts. Please merge them if necessary.`);
      }
      setImpositionProgress(100);

    } catch (e: any) {
      console.error("Error imposing PDF:", e);
      let errorMessage = "An unknown error occurred during PDF processing.";
      if (e?.message && typeof e.message === 'string') errorMessage = e.message;
      else if (typeof e === 'string') errorMessage = e;
      else if (e?.toString && e.toString() !== '[object Object]') errorMessage = e.toString();
      setError(errorMessage);
      setImpositionProgress(0);
    } finally {
      setIsLoading(false);
    }
  }, [
    inputFile, selectedSheet, columns, rows, bleedInches,
    horizontalGutterInches, verticalGutterInches, impositionType, sheetOrientation, readingDirection,
    clientName, includeInfo, isDuplex, jobInfo, addFirstSheetSlip, firstSheetSlipColor, showSpineMarks,
    rowOffsetType, alternateRotationType, creepInches, isLargeFile,
    clearOutput
  ]);

  return { imposePdf, outputPdfUrl, isLoading, error, message, clearOutput, impositionProgress };
};