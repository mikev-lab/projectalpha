import React, { useState, useEffect } from 'react';
import { SelectField } from './SelectField';
import { NumberField } from './NumberField';
import { Button } from './Button';
import { Icon } from './Icon';
import { 
    INTERIOR_PAPER_TYPES_OPTIONS, INTERIOR_PAPER_WEIGHT_OPTIONS, 
    COVER_PAPER_TYPE_OPTIONS, COVER_PAPER_WEIGHT_OPTIONS,
    INTERIOR_PAPER_PPI, COVER_PAPER_THICKNESS,
    DEFAULT_INTERIOR_PAPER_TYPE, DEFAULT_INTERIOR_PAPER_WEIGHT,
    DEFAULT_COVER_PAPER_TYPE, DEFAULT_COVER_PAPER_WEIGHT,
    DEFAULT_NUM_INTERIOR_PAGES, DEFAULT_FINISHED_BOOK_WIDTH_INCHES,
    DEFAULT_FINISHED_BOOK_HEIGHT_INCHES, DEFAULT_COVER_BLEED_INCHES,
    INCH_TO_POINTS, DEFAULT_SAFETY_MARGIN_INCHES
} from '../constants';
import { 
    InteriorPaperTypeKey, InteriorPaperWeightKey, 
    CoverPaperTypeKey, CoverPaperWeightKey 
} from '../types';

interface CalculatedDimensions {
    spineWidthInches: number;
    interiorBlockThicknessInches: number;
    fullCoverWidthInches: number;
    fullCoverHeightInches: number;
    selectedInteriorPPI: number;
    selectedCoverThicknessInches: number;
}

export const BookSpineCalculator: React.FC = () => {
    const [interiorPaperType, setInteriorPaperType] = useState<InteriorPaperTypeKey>(DEFAULT_INTERIOR_PAPER_TYPE);
    const [interiorPaperWeight, setInteriorPaperWeight] = useState<InteriorPaperWeightKey>(DEFAULT_INTERIOR_PAPER_WEIGHT);
    const [coverPaperType, setCoverPaperType] = useState<CoverPaperTypeKey>(DEFAULT_COVER_PAPER_TYPE);
    const [coverPaperWeight, setCoverPaperWeight] = useState<CoverPaperWeightKey>(DEFAULT_COVER_PAPER_WEIGHT);
    
    const [numInteriorPages, setNumInteriorPages] = useState<number>(DEFAULT_NUM_INTERIOR_PAGES);
    const [finishedBookWidth, setFinishedBookWidth] = useState<number>(DEFAULT_FINISHED_BOOK_WIDTH_INCHES);
    const [finishedBookHeight, setFinishedBookHeight] = useState<number>(DEFAULT_FINISHED_BOOK_HEIGHT_INCHES);
    const [coverBleed, setCoverBleed] = useState<number>(DEFAULT_COVER_BLEED_INCHES);

    const [calculatedDimensions, setCalculatedDimensions] = useState<CalculatedDimensions | null>(null);
    const [pageCountWarning, setPageCountWarning] = useState<string | null>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    useEffect(() => {
        if (numInteriorPages <= 0 || finishedBookWidth <= 0 || finishedBookHeight <= 0) {
            setCalculatedDimensions(null);
            return;
        }

        if (numInteriorPages % 2 !== 0) {
            setPageCountWarning("Odd number of pages is uncommon for books. Calculations will proceed, but typically books have an even number of pages.");
        } else {
            setPageCountWarning(null);
        }

        const ppi = INTERIOR_PAPER_PPI[interiorPaperType]?.[interiorPaperWeight];
        const coverThickness = COVER_PAPER_THICKNESS[coverPaperType]?.[coverPaperWeight];

        if (!ppi || typeof coverThickness === 'undefined') {
            setCalculatedDimensions(null); // Should not happen with valid defaults
            return;
        }

        const interiorBlockThickness = numInteriorPages / ppi;
        const spine = interiorBlockThickness + (coverThickness * 2);
        const fullCoverW = (2 * finishedBookWidth) + spine + (2 * coverBleed);
        const fullCoverH = finishedBookHeight + (2 * coverBleed);

        setCalculatedDimensions({
            spineWidthInches: spine,
            interiorBlockThicknessInches: interiorBlockThickness,
            fullCoverWidthInches: fullCoverW,
            fullCoverHeightInches: fullCoverH,
            selectedInteriorPPI: ppi,
            selectedCoverThicknessInches: coverThickness,
        });

    }, [
        interiorPaperType, interiorPaperWeight, coverPaperType, coverPaperWeight,
        numInteriorPages, finishedBookWidth, finishedBookHeight, coverBleed
    ]);
    
    const formatInches = (val: number) => val.toFixed(3);

    const handleExportTemplate = async () => {
        if (!calculatedDimensions || !window.PDFLib) {
            setExportError("Cannot export: Dimensions not calculated or PDF library not loaded.");
            return;
        }
        setIsExporting(true);
        setExportError(null);

        try {
            // FIX: Removed unused 'degrees' function from destructuring.
            const { PDFDocument, StandardFonts, cmyk, rgb } = window.PDFLib;
            const doc = await PDFDocument.create();
            const pageDims: [number, number] = [
                calculatedDimensions.fullCoverWidthInches * INCH_TO_POINTS,
                calculatedDimensions.fullCoverHeightInches * INCH_TO_POINTS,
            ];

            const helvetica = await doc.embedFont(StandardFonts.Helvetica);
            
            // --- Define Colors ---
            const guideCyan = cmyk(0.7, 0, 0, 0);
            const black = cmyk(0, 0, 0, 1);
            const guideGray = cmyk(0, 0, 0, 0.5);
            const guideRed = cmyk(0, 1, 1, 0);
            const noPrintZoneRed = rgb(1, 0.8, 0.8);

            // --- Define Dimensions in Points ---
            const bleedPts = coverBleed * INCH_TO_POINTS;
            const bookWidthPts = finishedBookWidth * INCH_TO_POINTS;
            const bookHeightPts = finishedBookHeight * INCH_TO_POINTS;
            const spineWidthPts = calculatedDimensions.spineWidthInches * INCH_TO_POINTS;
            const safetyMarginPts = DEFAULT_SAFETY_MARGIN_INCHES * INCH_TO_POINTS;
            const hingeOffsetPts = 0.125 * INCH_TO_POINTS; // 1/8" for glue safe zone
            
            // --- Calculate Guide Coordinates (common for both pages) ---
            const trimBox = {
                x: bleedPts,
                y: bleedPts,
                width: bookWidthPts * 2 + spineWidthPts,
                height: bookHeightPts
            };
            const leftSpineX = trimBox.x + bookWidthPts;
            const rightSpineX = leftSpineX + spineWidthPts;

            // ===================================
            // === PAGE 1: OUTSIDE COVER TEMPLATE ===
            // ===================================
            const outsideCoverPage = doc.addPage(pageDims);
            const { width: pageWidth, height: pageHeight } = outsideCoverPage.getSize();

            // Trim Box (Black)
            outsideCoverPage.drawRectangle({ ...trimBox, borderColor: black, borderWidth: 0.5 });
            
            // Spine Lines (Cyan)
            outsideCoverPage.drawLine({ start: { x: leftSpineX, y: trimBox.y }, end: { x: leftSpineX, y: trimBox.y + trimBox.height }, color: guideCyan, thickness: 0.5 });
            outsideCoverPage.drawLine({ start: { x: rightSpineX, y: trimBox.y }, end: { x: rightSpineX, y: trimBox.y + trimBox.height }, color: guideCyan, thickness: 0.5 });

            // Hinge / Glue Safe Zone Guide (Dashed Red)
            const hingeDash = { dashArray: [4, 4], dashPhase: 0 };
            const leftHingeX = leftSpineX - hingeOffsetPts;
            const rightHingeX = rightSpineX + hingeOffsetPts;
            outsideCoverPage.drawLine({ start: { x: leftHingeX, y: 0 }, end: { x: leftHingeX, y: pageHeight }, color: guideRed, thickness: 0.5, ...hingeDash });
            outsideCoverPage.drawLine({ start: { x: rightHingeX, y: 0 }, end: { x: rightHingeX, y: pageHeight }, color: guideRed, thickness: 0.5, ...hingeDash });

            // Safety Margins (Dashed Cyan)
            const safetyDash = { dashArray: [4, 4], dashPhase: 0 };
            outsideCoverPage.drawRectangle({ x: trimBox.x + safetyMarginPts, y: trimBox.y + safetyMarginPts, width: bookWidthPts - hingeOffsetPts - safetyMarginPts, height: bookHeightPts - 2 * safetyMarginPts, borderColor: guideCyan, borderWidth: 0.5, ...safetyDash });
            outsideCoverPage.drawRectangle({ x: rightSpineX + hingeOffsetPts, y: trimBox.y + safetyMarginPts, width: bookWidthPts - hingeOffsetPts - safetyMarginPts, height: bookHeightPts - 2 * safetyMarginPts, borderColor: guideCyan, borderWidth: 0.5, ...safetyDash });
            
            // Annotations for Outside Cover
            const annotationSize = 8;
            const centerBackX = trimBox.x + bookWidthPts / 2;
            const centerSpineX = leftSpineX + spineWidthPts / 2;
            const centerFrontX = rightSpineX + bookWidthPts / 2;
            outsideCoverPage.drawText('BACK COVER', { x: centerBackX - helvetica.widthOfTextAtSize('BACK COVER', annotationSize)/2, y: trimBox.y + trimBox.height/2, font: helvetica, size: annotationSize, color: guideGray });
            outsideCoverPage.drawText('SPINE', { x: centerSpineX - helvetica.widthOfTextAtSize('SPINE', annotationSize)/2, y: trimBox.y + trimBox.height/2, font: helvetica, size: annotationSize, color: guideGray });
            outsideCoverPage.drawText('FRONT COVER', { x: centerFrontX - helvetica.widthOfTextAtSize('FRONT COVER', annotationSize)/2, y: trimBox.y + trimBox.height/2, font: helvetica, size: annotationSize, color: guideGray });
            outsideCoverPage.drawText('PAGE 1: OUTSIDE COVER', { x: bleedPts, y: pageHeight - bleedPts/2 - annotationSize, font: helvetica, size: annotationSize, color: black});

            // ===================================
            // === PAGE 2: INSIDE COVER TEMPLATE ===
            // ===================================
            const insideCoverPage = doc.addPage(pageDims);

            // Trim Box and Spine guides for reference
            insideCoverPage.drawRectangle({ ...trimBox, borderColor: black, borderWidth: 0.5 });
            insideCoverPage.drawLine({ start: { x: leftSpineX, y: trimBox.y }, end: { x: leftSpineX, y: trimBox.y + trimBox.height }, color: guideCyan, thickness: 0.5 });
            insideCoverPage.drawLine({ start: { x: rightSpineX, y: trimBox.y }, end: { x: rightSpineX, y: trimBox.y + trimBox.height }, color: guideCyan, thickness: 0.5 });

            // "NO PRINTING" Zone
            const noPrintZoneX = leftSpineX - hingeOffsetPts;
            const noPrintZoneWidth = spineWidthPts + 2 * hingeOffsetPts;
            insideCoverPage.drawRectangle({
                x: noPrintZoneX,
                y: trimBox.y,
                width: noPrintZoneWidth,
                height: trimBox.height,
                color: noPrintZoneRed,
                opacity: 0.5,
            });

            // Annotations for Inside Cover
            insideCoverPage.drawText('INSIDE BACK COVER', { x: centerBackX - helvetica.widthOfTextAtSize('INSIDE BACK COVER', annotationSize)/2, y: trimBox.y + trimBox.height/2, font: helvetica, size: annotationSize, color: guideGray });
            insideCoverPage.drawText('INSIDE FRONT COVER', { x: centerFrontX - helvetica.widthOfTextAtSize('INSIDE FRONT COVER', annotationSize)/2, y: trimBox.y + trimBox.height/2, font: helvetica, size: annotationSize, color: guideGray });
            
            const noPrintText = 'NO PRINTING - GLUE AREA';
            const noPrintTextWidth = helvetica.widthOfTextAtSize(noPrintText, annotationSize);
            const noPrintZoneCenterX = noPrintZoneX + noPrintZoneWidth / 2;
            insideCoverPage.drawText(noPrintText, {
                x: noPrintZoneCenterX - noPrintTextWidth / 2,
                y: trimBox.y + trimBox.height - annotationSize * 1.5,
                font: helvetica,
                size: annotationSize,
                color: guideRed,
            });
            insideCoverPage.drawText(noPrintText, {
                x: noPrintZoneCenterX + helvetica.heightAtSize(annotationSize)/2,
                y: trimBox.y + trimBox.height/2 - noPrintTextWidth/2,
                font: helvetica,
                size: annotationSize,
                color: guideRed,
                // FIX: The 'rotate' property expects an object, not a number.
                rotate: { angle: 90, type: 'degrees' },
            });
            
            insideCoverPage.drawText('PAGE 2: INSIDE COVER', { x: bleedPts, y: pageHeight - bleedPts/2 - annotationSize, font: helvetica, size: annotationSize, color: black});
            
            // --- Generate and Download 2-Page PDF ---
            const pdfBytes = await doc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `book_cover_templates_${finishedBookWidth}x${finishedBookHeight}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (error: any) {
            console.error("Failed to export PDF template:", error);
            setExportError(error.message || "An unknown error occurred during export.");
        } finally {
            setIsExporting(false);
        }
    };


    return (
        <div className="bg-white shadow-2xl rounded-lg p-6 sm:p-8 space-y-6">
            <div className="border-b border-gray-200 pb-5">
                <h2 className="text-xl leading-6 font-semibold text-gray-900 flex items-center">
                    <Icon iconName="settings" className="w-6 h-6 mr-3 text-purple-600" />
                    Book Cover & Spine Calculator
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                    Estimate book spine width and full cover dimensions for design. These calculations are for reference and do not affect the PDF imposition above.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
                {/* Column 1: Inputs */}
                <div className="space-y-6">
                    <div>
                        <h3 className="text-md font-medium text-gray-800 mb-2">Interior Paper</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SelectField
                                id="interiorPaperType"
                                label="Type"
                                value={interiorPaperType}
                                options={[...INTERIOR_PAPER_TYPES_OPTIONS]}
                                onChange={(val) => setInteriorPaperType(val as InteriorPaperTypeKey)}
                            />
                            <SelectField
                                id="interiorPaperWeight"
                                label="Weight"
                                value={interiorPaperWeight}
                                options={[...INTERIOR_PAPER_WEIGHT_OPTIONS]}
                                onChange={(val) => setInteriorPaperWeight(val as InteriorPaperWeightKey)}
                            />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-md font-medium text-gray-800 mb-2">Cover Paper</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <SelectField
                                id="coverPaperType"
                                label="Type"
                                value={coverPaperType}
                                options={[...COVER_PAPER_TYPE_OPTIONS]}
                                onChange={(val) => setCoverPaperType(val as CoverPaperTypeKey)}
                            />
                            <SelectField
                                id="coverPaperWeight"
                                label="Weight"
                                value={coverPaperWeight}
                                options={[...COVER_PAPER_WEIGHT_OPTIONS]}
                                onChange={(val) => setCoverPaperWeight(val as CoverPaperWeightKey)}
                            />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-md font-medium text-gray-800 mb-2">Book & Cover Specifications</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <NumberField
                                id="numInteriorPages"
                                label="Number of Interior Pages"
                                value={numInteriorPages}
                                onChange={setNumInteriorPages}
                                min={2} // A book needs at least 2 pages (1 sheet)
                                step={2}
                            />
                            <NumberField
                                id="finishedBookWidth"
                                label="Finished Book Width"
                                unit="inches"
                                value={finishedBookWidth}
                                onChange={setFinishedBookWidth}
                                min={1}
                                step={0.001}
                            />
                            <NumberField
                                id="finishedBookHeight"
                                label="Finished Book Height"
                                unit="inches"
                                value={finishedBookHeight}
                                onChange={setFinishedBookHeight}
                                min={1}
                                step={0.001}
                            />
                            <NumberField
                                id="coverBleed"
                                label="Cover Bleed (per side)"
                                unit="inches"
                                value={coverBleed}
                                onChange={setCoverBleed}
                                min={0}
                                step={0.001}
                            />
                        </div>
                    </div>
                     {pageCountWarning && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-300 rounded-md text-sm text-yellow-700">
                            {pageCountWarning}
                        </div>
                    )}
                </div>

                {/* Column 2: Results */}
                <div className="space-y-4">
                     <h3 className="text-md font-medium text-gray-800 mb-2">Calculated Dimensions</h3>
                    {calculatedDimensions ? (
                        <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-3 text-sm">
                            <div>
                                <span className="font-semibold text-slate-700">Total Spine Width:</span>
                                <span className="ml-2 text-indigo-600 font-bold text-base">{formatInches(calculatedDimensions.spineWidthInches)} inches</span>
                                <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-500">
                                    <li>Interior Paper Block: {formatInches(calculatedDimensions.interiorBlockThicknessInches)}"</li>
                                    <li>Cover Thickness (x2): {formatInches(calculatedDimensions.selectedCoverThicknessInches * 2)}"</li>
                                </ul>
                            </div>
                            <hr/>
                            <div>
                                <span className="font-semibold text-slate-700">Selected Interior Paper:</span>
                                <span className="ml-2 text-slate-600">
                                    {INTERIOR_PAPER_TYPES_OPTIONS.find(opt => opt.value === interiorPaperType)?.label},&nbsp;
                                    {INTERIOR_PAPER_WEIGHT_OPTIONS.find(opt => opt.value === interiorPaperWeight)?.label}
                                    &nbsp;(PPI: {calculatedDimensions.selectedInteriorPPI})
                                </span>
                            </div>
                            <div>
                                <span className="font-semibold text-slate-700">Selected Cover Paper:</span>
                                <span className="ml-2 text-slate-600">
                                    {COVER_PAPER_TYPE_OPTIONS.find(opt => opt.value === coverPaperType)?.label},&nbsp;
                                    {COVER_PAPER_WEIGHT_OPTIONS.find(opt => opt.value === coverPaperWeight)?.label}
                                    &nbsp;(Sheet Thickness: {formatInches(calculatedDimensions.selectedCoverThicknessInches)} inches)
                                </span>
                            </div>
                            <hr/>
                            <div>
                                <span className="font-semibold text-slate-700">Full Cover Spread (for design, with bleed):</span>
                                <ul className="list-disc list-inside ml-4 mt-1">
                                    <li>Width: <span className="text-indigo-600 font-medium">{formatInches(calculatedDimensions.fullCoverWidthInches)} inches</span></li>
                                    <li>Height: <span className="text-indigo-600 font-medium">{formatInches(calculatedDimensions.fullCoverHeightInches)} inches</span></li>
                                </ul>
                            </div>
                             <div>
                                <span className="font-semibold text-slate-700">Breakdown of Trimmed Area:</span>
                                <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-500">
                                    <li>Back Cover Panel: {formatInches(finishedBookWidth)}" W x {formatInches(finishedBookHeight)}" H</li>
                                    <li>Spine Panel: {formatInches(calculatedDimensions.spineWidthInches)}" W x {formatInches(finishedBookHeight)}" H</li>
                                    <li>Front Cover Panel: {formatInches(finishedBookWidth)}" W x {formatInches(finishedBookHeight)}" H</li>
                                    <li>Bleed (added to each of 4 outer edges): {formatInches(coverBleed)}"</li>
                                </ul>
                            </div>
                            <div className="pt-2">
                                <Button
                                    onClick={handleExportTemplate}
                                    isLoading={isExporting}
                                    disabled={!calculatedDimensions || isExporting}
                                    icon="download"
                                    variant="secondary"
                                    className="w-full"
                                >
                                    Export Cover Templates (PDF)
                                </Button>
                                {exportError && <p className="text-red-600 text-xs mt-1">{exportError}</p>}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500">Enter valid parameters to see calculations.</p>
                    )}
                </div>
            </div>
        </div>
    );
};
