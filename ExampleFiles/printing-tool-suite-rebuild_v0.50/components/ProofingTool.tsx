




import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileUploadButton } from './FileUploadButton';
import { NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { ToggleSwitch } from './ToggleSwitch';
import { Icon } from './Icon';
import { Button } from './Button';
import {
    PDFDocumentProxy as PDFJSDocumentProxy,
    RenderParameters,
    RenderTask,
    PDFDocument as PDFLibPDFDocument,
    PDFFont as PDFLibPDFFont,
    PDFPage as PDFLibPage,
    RGB as PDFLibRGB,
    Box as PDFLibBox,
    PDFImage,
    BindingTypeProofing,
} from '../types';
import { 
    INCH_TO_POINTS, DEFAULT_BLEED_INCHES, DEFAULT_SAFETY_MARGIN_INCHES,
    INCH_TO_MM, MM_TO_INCH, STANDARD_PAPER_SIZES,
    PERFECT_BIND_GUTTER_INCHES, BINDING_TYPE_PROOFING_OPTIONS
} from '../constants';

const MIN_ZOOM_LEVEL = 0.25;
const MAX_ZOOM_LEVEL = 5.0; 
const ZOOM_STEP_BUTTON = 0.25;
const ZOOM_STEP_WHEEL = 0.1;

const OFFSCREEN_RENDER_SCALE = 2.0; 
const EXPORT_PAGE_RENDER_SCALE = 1.5;


type Unit = 'in' | 'mm';
type ViewMode = 'single' | 'spread';
type ReadingDirection = 'ltr' | 'rtl';


// Helper to draw text with basic wrapping within a given width
async function drawTextWithWrap(
    page: PDFLibPage,
    text: string,
    startX: number,
    startY: number, 
    maxWidth: number,
    lineHeight: number, 
    font: PDFLibPDFFont,
    fontSize: number,
    color: PDFLibRGB
) {
    const words = text.split(' ');
    let currentLine = '';
    let currentBaselineY = startY - font.heightAtSize(fontSize) * 0.15; 

    for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (textWidth > maxWidth && currentLine) {
            page.drawText(currentLine, { x: startX, y: currentBaselineY, font, size: fontSize, color });
            currentLine = word;
            currentBaselineY -= lineHeight; 
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) {
        page.drawText(currentLine, { x: startX, y: currentBaselineY, font, size: fontSize, color });
    }
    return currentBaselineY - lineHeight; 
}


// Helper function to generate gradient images for the perfect bound shadow effect in the PDF export.
const createShadowImagesForPdf = async (doc: PDFLibPDFDocument): Promise<{ left: PDFImage | null, right: PDFImage | null }> => {
    try {
        const canvas = document.createElement('canvas');
        const width = 128; // pixels, for decent gradient quality
        const height = 1;  // pixels, it will be stretched vertically
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { left: null, right: null };

        // 1. Create RIGHT-facing shadow (opaque on left, transparent on right)
        // This is for the right-hand page, with the shadow on its left edge.
        const rightGradient = ctx.createLinearGradient(0, 0, width, 0);
        rightGradient.addColorStop(0, 'rgba(0,0,0,0.75)');
        rightGradient.addColorStop(0.3, 'rgba(0,0,0,0.5)');
        rightGradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rightGradient;
        ctx.fillRect(0, 0, width, height);

        const rightPngBytes = await new Promise<Uint8Array>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error("Right shadow canvas toBlob failed.")); return; }
                const reader = new FileReader();
                reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                reader.onerror = reject;
                reader.readAsArrayBuffer(blob);
            }, 'image/png');
        });

        // 2. Clear canvas and create LEFT-facing shadow (transparent on left, opaque on right)
        // This is for the left-hand page, with the shadow on its right edge.
        ctx.clearRect(0, 0, width, height);
        const leftGradient = ctx.createLinearGradient(0, 0, width, 0);
        leftGradient.addColorStop(0, 'rgba(0,0,0,0)');
        leftGradient.addColorStop(0.7, 'rgba(0,0,0,0.5)');
        leftGradient.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = leftGradient;
        ctx.fillRect(0, 0, width, height);

        const leftPngBytes = await new Promise<Uint8Array>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error("Left shadow canvas toBlob failed.")); return; }
                const reader = new FileReader();
                reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                reader.onerror = reject;
                reader.readAsArrayBuffer(blob);
            }, 'image/png');
        });

        const [left, right] = await Promise.all([
            doc.embedPng(leftPngBytes),
            doc.embedPng(rightPngBytes),
        ]);

        return { left, right };
    } catch (e) {
        console.error("Failed to create shadow images for PDF export:", e);
        return { left: null, right: null };
    }
};


export const ProofingTool: React.FC = () => {
    const [inputFile, setInputFile] = useState<File | null>(null);
    const [pdfDocProxy, setPdfDocProxy] = useState<PDFJSDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [originalPageSize, setOriginalPageSize] = useState<{ width: number; height: number } | null>(null);

    const [trimWidthInches, setTrimWidthInches] = useState<number>(8.5);
    const [trimHeightInches, setTrimHeightInches] = useState<number>(11);
    const [bleedInchesInternal, setBleedInchesInternal] = useState<number>(DEFAULT_BLEED_INCHES);
    const [safetyMarginInchesInternal, setSafetyMarginInchesInternal] = useState<number>(DEFAULT_SAFETY_MARGIN_INCHES);

    const [currentUnit, setCurrentUnit] = useState<Unit>('in');
    const [selectedPresetName, setSelectedPresetName] = useState<string>('custom');
    const [viewMode, setViewMode] = useState<ViewMode>('spread');
    const [readingDirection, setReadingDirection] = useState<ReadingDirection>('ltr');
    const [bindingType, setBindingType] = useState<BindingTypeProofing>('perfectBound');


    const [currentViewIndex, setCurrentViewIndex] = useState<number>(0); // 0-based index for current page or spread
    const [totalDisplayableViews, setTotalDisplayableViews] = useState<number>(0);


    const [showTrimGuide, setShowTrimGuide] = useState<boolean>(true);
    const [showBleedGuide, setShowBleedGuide] = useState<boolean>(true);
    const [showSafetyGuide, setShowSafetyGuide] = useState<boolean>(true);

    const canvasRef = useRef<HTMLCanvasElement>(null); 
    const offscreenPageCanvasRef = useRef<HTMLCanvasElement | null>(null); 
    const previewAreaRef = useRef<HTMLDivElement>(null);
    
    const [isLoading, setIsLoading] = useState<boolean>(false); 
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [proofingExportProgress, setProofingExportProgress] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [offscreenContentVersion, setOffscreenContentVersion] = useState<number>(0);

    const [zoomLevel, setZoomLevel] = useState<number>(1.0);
    const [panState, setPanState] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState<boolean>(false);
    const panStartPointRef = useRef<{ x: number; y: number } | null>(null);
    
    const activePdfRenderTaskRef = useRef<RenderTask | null>(null);

    const layoutMetricsRef = useRef<{
        visibleCanvasWidth: number; visibleCanvasHeight: number;
        baseScaleToFitOffscreenToVisible: number; 
        finalDisplayScale: number; 
        displayOriginX: number; displayOriginY: number; 
        offscreenBufferContentWidthPt: number; // Width of content ON the offscreen buffer (could be 1 or 2 pages)
        offscreenBufferContentHeightPt: number; // Height of content ON the offscreen buffer
    } | null>(null);

    // Function to get page numbers for the current view (0-indexed view index)
    const getPagesForView = useCallback((viewIdx: number, totalDocPages: number, currentViewMode: ViewMode): number[] => {
        if (totalDocPages === 0) return [];
        if (currentViewMode === 'single') {
            return viewIdx < totalDocPages ? [viewIdx + 1] : [];
        }

        // Spread Mode Logic
        if (viewIdx === 0) return [1]; // First view is always page 1

        const firstPageInPotentialSpread = 1 + (viewIdx - 1) * 2 + 1; // page index 2, 4, 6...
        const secondPageInPotentialSpread = firstPageInPotentialSpread + 1; // page index 3, 5, 7...

        if (firstPageInPotentialSpread > totalDocPages) return []; // viewIdx is out of bounds
        if (firstPageInPotentialSpread === totalDocPages) return [totalDocPages]; // Last page is single
        if (secondPageInPotentialSpread > totalDocPages) return [firstPageInPotentialSpread]; // Should mean totalDocPages is even, and firstPageInPotentialSpread is the last one.
        
        return [firstPageInPotentialSpread, secondPageInPotentialSpread];
    }, []);
    
    useEffect(() => {
        if (numPages === 0) {
            setTotalDisplayableViews(0);
            setCurrentViewIndex(0);
            return;
        }
        if (viewMode === 'single') {
            setTotalDisplayableViews(numPages);
        } else { // spread
            if (numPages === 1) {
                setTotalDisplayableViews(1);
            } else {
                setTotalDisplayableViews(1 + Math.ceil((numPages - 1) / 2));
            }
        }
        setCurrentViewIndex(0); // Reset to first view when mode or numPages changes
    }, [numPages, viewMode]);


    const handleTrimWidthChange = (valueInCurrentUnit: number) => {
        setTrimWidthInches(currentUnit === 'mm' ? valueInCurrentUnit * MM_TO_INCH : valueInCurrentUnit);
        setSelectedPresetName('custom');
    };

    const handleTrimHeightChange = (valueInCurrentUnit: number) => {
        setTrimHeightInches(currentUnit === 'mm' ? valueInCurrentUnit * MM_TO_INCH : valueInCurrentUnit);
        setSelectedPresetName('custom');
    };
    
    const handleBleedChange = (valueInCurrentUnit: number) => {
        setBleedInchesInternal(currentUnit === 'mm' ? valueInCurrentUnit * MM_TO_INCH : valueInCurrentUnit);
    };

    const handleSafetyMarginChange = (valueInCurrentUnit: number) => {
        setSafetyMarginInchesInternal(currentUnit === 'mm' ? valueInCurrentUnit * MM_TO_INCH : valueInCurrentUnit);
    };

    const handlePresetChange = (presetName: string) => {
        setSelectedPresetName(presetName);
        if (presetName === 'custom') {
            return;
        }
        const preset = STANDARD_PAPER_SIZES.find(p => p.name === presetName);
        if (preset) {
            setTrimWidthInches(preset.width_mm * MM_TO_INCH);
            setTrimHeightInches(preset.height_mm * MM_TO_INCH);
        }
    };

    const formatNumberForDisplay = (valueInInches: number, unit: Unit, precisionInch = 3, precisionMm = 1): number => {
        if (unit === 'mm') {
            return parseFloat((valueInInches * INCH_TO_MM).toFixed(precisionMm));
        }
        return parseFloat(valueInInches.toFixed(precisionInch));
    };

    const handleFileChange = (file: File) => {
        setInputFile(file);
        setCurrentViewIndex(0);
        setZoomLevel(1.0);
        setPanState({ x: 0, y: 0 });
        setError(null);
        setOriginalPageSize(null);
        setNumPages(0);
        if (pdfDocProxy) {
            try { pdfDocProxy.destroy(); } catch (e) { console.warn("Error destroying old pdfDocProxy on file change", e); }
            setPdfDocProxy(null);
        }
        if (activePdfRenderTaskRef.current) {
            activePdfRenderTaskRef.current.cancel();
            activePdfRenderTaskRef.current = null;
        }
        if (offscreenPageCanvasRef.current) {
            const ctx = offscreenPageCanvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, offscreenPageCanvasRef.current.width, offscreenPageCanvasRef.current.height);
        }
        setOffscreenContentVersion(v => v + 1); 
    };

    useEffect(() => {
        let isMounted = true;
        if (!inputFile || !window.pdfjsLib) {
            if (pdfDocProxy) {
                try { pdfDocProxy.destroy(); } catch (e) { console.warn("Error destroying pdfDocProxy on input clear", e); }
                setPdfDocProxy(null);
            }
            setNumPages(0);
            setOriginalPageSize(null);
            return;
        }

        setIsLoading(true); 
        setError(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            if (!isMounted || !e.target?.result || !window.pdfjsLib) {
                if (isMounted) setIsLoading(false);
                return;
            }
            try {
                if (pdfDocProxy) { 
                    try { pdfDocProxy.destroy(); } catch (destroyError) { console.warn("Error destroying previous PDF doc:", destroyError); }
                }
                const loadingTask = window.pdfjsLib.getDocument({ data: e.target.result as ArrayBuffer });
                const pdf = await loadingTask.promise;
                if (!isMounted) { try { pdf.destroy(); } catch (de) { console.warn(de); } return; }

                setPdfDocProxy(pdf);
                setNumPages(pdf.numPages);
                const firstPage = await pdf.getPage(1); 
                if (!isMounted) { try { pdf.destroy(); } catch (de) { console.warn(de); } return; }
                const viewport = firstPage.getViewport({ scale: 1 });
                setOriginalPageSize({ width: viewport.width, height: viewport.height });
                setCurrentViewIndex(0); 
            } catch (loadError: any) {
                if (!isMounted) return;
                console.error("Error loading PDF for proofing:", loadError);
                setError(loadError.message || "Failed to load PDF.");
                if (pdfDocProxy && !isMounted) { try { pdfDocProxy.destroy(); } catch (de) { console.warn(de); } } 
                setPdfDocProxy(null);
                setOriginalPageSize(null);
            } 
        };
        reader.readAsArrayBuffer(inputFile);

        return () => {
            isMounted = false;
        };
    }, [inputFile]);
    
    useEffect(() => {
        return () => {
            if (pdfDocProxy) {
                try { pdfDocProxy.destroy(); } catch (e) { console.warn("Error destroying pdfDocProxy on unmount", e); }
            }
            if (activePdfRenderTaskRef.current) {
                activePdfRenderTaskRef.current.cancel();
                activePdfRenderTaskRef.current = null;
            }
        };
    }, [pdfDocProxy]);

    const renderCurrentPageToOffscreenBuffer = useCallback(async () => {
        if (!pdfDocProxy || !originalPageSize || totalDisplayableViews === 0) {
            if (offscreenPageCanvasRef.current) {
                const ctx = offscreenPageCanvasRef.current.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, offscreenPageCanvasRef.current.width, offscreenPageCanvasRef.current.height);
            }
            setOffscreenContentVersion(v => v + 1); setIsLoading(false); return;
        }

        if (activePdfRenderTaskRef.current) activePdfRenderTaskRef.current.cancel();
        setIsLoading(true); setError(null);
        
        let localRenderTasks: RenderTask[] = [];

        try {
            const pagesToRenderIndices = getPagesForView(currentViewIndex, numPages, viewMode);
            if (pagesToRenderIndices.length === 0) {
                 if (offscreenPageCanvasRef.current) {
                    const ctx = offscreenPageCanvasRef.current.getContext('2d');
                    if (ctx) ctx.clearRect(0, 0, offscreenPageCanvasRef.current.width, offscreenPageCanvasRef.current.height);
                }
                setOffscreenContentVersion(v => v + 1); setIsLoading(false); return;
            }

            if (!offscreenPageCanvasRef.current) offscreenPageCanvasRef.current = document.createElement('canvas');
            const offscreenCanvas = offscreenPageCanvasRef.current;
            const offscreenCtx = offscreenCanvas.getContext('2d');
            if (!offscreenCtx) throw new Error("Could not get offscreen canvas context.");
            
            const singlePageScaledWidth = originalPageSize.width * OFFSCREEN_RENDER_SCALE;
            const singlePageScaledHeight = originalPageSize.height * OFFSCREEN_RENDER_SCALE;

            if (pagesToRenderIndices.length === 1) { // Single page view
                offscreenCanvas.width = singlePageScaledWidth;
                offscreenCanvas.height = singlePageScaledHeight;
                offscreenCtx.clearRect(0,0, offscreenCanvas.width, offscreenCanvas.height);
                const pageProxy = await pdfDocProxy.getPage(pagesToRenderIndices[0]);
                const viewport = pageProxy.getViewport({ scale: OFFSCREEN_RENDER_SCALE });
                const task = pageProxy.render({ canvasContext: offscreenCtx, viewport });
                localRenderTasks.push(task);
                activePdfRenderTaskRef.current = task;
                await task.promise;

            } else { // Spread view
                const bleedPt = bleedInchesInternal * INCH_TO_POINTS;
                const spreadWidthPt = (2 * originalPageSize.width) - (2 * bleedPt);
                
                offscreenCanvas.width = spreadWidthPt * OFFSCREEN_RENDER_SCALE;
                offscreenCanvas.height = singlePageScaledHeight;
                offscreenCtx.clearRect(0,0, offscreenCanvas.width, offscreenCanvas.height);

                const tempRenderCanvas = document.createElement('canvas');
                tempRenderCanvas.width = singlePageScaledWidth;
                tempRenderCanvas.height = singlePageScaledHeight;
                const tempRenderCtx = tempRenderCanvas.getContext('2d');
                if (!tempRenderCtx) throw new Error("Could not create temp canvas for spread rendering.");

                // Render first page of spread
                const pageNum1 = readingDirection === 'ltr' ? pagesToRenderIndices[0] : pagesToRenderIndices[1];
                const pageProxy1 = await pdfDocProxy.getPage(pageNum1);
                const viewport1 = pageProxy1.getViewport({ scale: OFFSCREEN_RENDER_SCALE });
                const task1 = pageProxy1.render({ canvasContext: tempRenderCtx, viewport: viewport1 });
                localRenderTasks.push(task1); activePdfRenderTaskRef.current = task1;
                await task1.promise;
                offscreenCtx.drawImage(tempRenderCanvas, 0, 0);

                // Render second page of spread
                tempRenderCtx.clearRect(0, 0, tempRenderCanvas.width, tempRenderCanvas.height);
                const pageNum2 = readingDirection === 'ltr' ? pagesToRenderIndices[1] : pagesToRenderIndices[0];
                const pageProxy2 = await pdfDocProxy.getPage(pageNum2);
                const viewport2 = pageProxy2.getViewport({ scale: OFFSCREEN_RENDER_SCALE });
                const task2 = pageProxy2.render({ canvasContext: tempRenderCtx, viewport: viewport2 });
                localRenderTasks.push(task2); activePdfRenderTaskRef.current = task2;
                await task2.promise;

                const drawX2 = (originalPageSize.width - (2 * bleedPt)) * OFFSCREEN_RENDER_SCALE;
                offscreenCtx.drawImage(tempRenderCanvas, drawX2, 0);
            }

            setOffscreenContentVersion(v => v + 1); 
        } catch (renderError: any) {
            if (renderError.name === 'RenderingCancelledException') console.log('ProofingTool: Offscreen PDF rendering cancelled.');
            else { console.error("Error rendering PDF page to offscreen buffer:", renderError); setError(renderError.message || "Failed to render PDF to buffer."); }
        } finally {
            if (localRenderTasks.includes(activePdfRenderTaskRef.current!)) activePdfRenderTaskRef.current = null;
            setIsLoading(false);
        }
    }, [pdfDocProxy, currentViewIndex, originalPageSize, numPages, viewMode, readingDirection, totalDisplayableViews, getPagesForView, bleedInchesInternal]);

    useEffect(() => {
        renderCurrentPageToOffscreenBuffer();
    }, [renderCurrentPageToOffscreenBuffer]);

    const drawDisplayCanvas = useCallback(() => {
        const visibleCanvas = canvasRef.current;
        const container = previewAreaRef.current;
        const offscreenBuffer = offscreenPageCanvasRef.current;

        if (!visibleCanvas || !container ) { layoutMetricsRef.current = null; return; }
        const visibleCtx = visibleCanvas.getContext('2d');
        if (!visibleCtx) { layoutMetricsRef.current = null; return; }

        if (visibleCanvas.width !== container.clientWidth || visibleCanvas.height !== container.clientHeight) {
            visibleCanvas.width = container.clientWidth; visibleCanvas.height = container.clientHeight;
        }
        visibleCtx.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);

        if (!offscreenBuffer || !originalPageSize || offscreenBuffer.width === 0 || offscreenBuffer.height === 0 || numPages === 0) {
            if (!inputFile) { visibleCtx.fillStyle = 'gray'; visibleCtx.font = '16px Arial'; visibleCtx.textAlign = 'center'; visibleCtx.fillText('Upload a PDF to start proofing.', visibleCanvas.width / 2, visibleCanvas.height / 2); }
            else if (isLoading && !pdfDocProxy && !error) { visibleCtx.fillStyle = 'gray'; visibleCtx.font = '16px Arial'; visibleCtx.textAlign = 'center'; visibleCtx.fillText('Loading PDF file...', visibleCanvas.width / 2, visibleCanvas.height / 2); }
            else if (error) { visibleCtx.fillStyle = 'red'; visibleCtx.font = '12px Arial'; visibleCtx.textAlign = 'center'; const errorLines = error.match(/.{1,50}/g) || [error]; errorLines.forEach((line, index) => visibleCtx.fillText(line, visibleCanvas.width / 2, visibleCanvas.height / 2 + index * 15)); }
            layoutMetricsRef.current = null; return;
        }

        const pagesInView = getPagesForView(currentViewIndex, numPages, viewMode);
        const isSpread = pagesInView.length === 2;
        
        // For perfect bound, we no longer add a physical gutter. It's rendered as butted pages like saddle stitch.
        const gutterPt = 0; //isSpread && bindingType === 'perfectBound' ? PERFECT_BIND_GUTTER_INCHES * INCH_TO_POINTS : 0;
        const gutterOnBufferScale = gutterPt * OFFSCREEN_RENDER_SCALE;
        const totalContentWidthOnBufferScale = offscreenBuffer.width + gutterOnBufferScale;

        const canvasPadding = 10;
        const availableWidth = visibleCanvas.width - 2 * canvasPadding;
        const availableHeight = visibleCanvas.height - 2 * canvasPadding;
        
        const baseScaleToFitOffscreenToVisible = Math.min(availableWidth / totalContentWidthOnBufferScale, availableHeight / offscreenBuffer.height);
        const finalDisplayScale = baseScaleToFitOffscreenToVisible * zoomLevel;

        const displayedOffscreenContentWidth = totalContentWidthOnBufferScale * finalDisplayScale;
        const displayedOffscreenContentHeight = offscreenBuffer.height * finalDisplayScale;
        const displayOriginX = (visibleCanvas.width - displayedOffscreenContentWidth) / 2 + panState.x;
        const displayOriginY = (visibleCanvas.height - displayedOffscreenContentHeight) / 2 + panState.y;

        layoutMetricsRef.current = {
            visibleCanvasWidth: visibleCanvas.width, visibleCanvasHeight: visibleCanvas.height,
            baseScaleToFitOffscreenToVisible, finalDisplayScale, displayOriginX, displayOriginY,
            offscreenBufferContentWidthPt: totalContentWidthOnBufferScale / OFFSCREEN_RENDER_SCALE, 
            offscreenBufferContentHeightPt: offscreenBuffer.height / OFFSCREEN_RENDER_SCALE,
        };

        visibleCtx.save();
        visibleCtx.translate(displayOriginX, displayOriginY);
        visibleCtx.scale(finalDisplayScale, finalDisplayScale);
        
        if (isSpread) {
            const halfBufferWidth = offscreenBuffer.width / 2;
            // Draw left half of the offscreen buffer (which contains the left page)
            visibleCtx.drawImage(offscreenBuffer, 0, 0, halfBufferWidth, offscreenBuffer.height, 0, 0, halfBufferWidth, offscreenBuffer.height);
            // Draw right half of the offscreen buffer (right page), butted up against the left
            visibleCtx.drawImage(offscreenBuffer, halfBufferWidth, 0, halfBufferWidth, offscreenBuffer.height, halfBufferWidth + gutterOnBufferScale, 0, halfBufferWidth, offscreenBuffer.height);

            if (bindingType === 'perfectBound') {
                // Draw the shadow overlay for the gutter to suggest an inner margin
                const shadowWidthPt = 0.5 * INCH_TO_POINTS; // 0.5 inches per side
                const shadowWidthOnBufferScale = shadowWidthPt * OFFSCREEN_RENDER_SCALE;
                const spreadCenterOnBufferScale = halfBufferWidth;
        
                // Gradient for the left page's inside edge
                const leftGradient = visibleCtx.createLinearGradient(spreadCenterOnBufferScale, 0, spreadCenterOnBufferScale - shadowWidthOnBufferScale, 0);
                leftGradient.addColorStop(0, 'rgba(0,0,0,0.75)');
                leftGradient.addColorStop(0.3, 'rgba(0,0,0,0.5)');
                leftGradient.addColorStop(1, 'rgba(0,0,0,0)');
                visibleCtx.fillStyle = leftGradient;
                visibleCtx.fillRect(spreadCenterOnBufferScale - shadowWidthOnBufferScale, 0, shadowWidthOnBufferScale, offscreenBuffer.height);
        
                // Gradient for the right page's inside edge
                const rightGradient = visibleCtx.createLinearGradient(spreadCenterOnBufferScale, 0, spreadCenterOnBufferScale + shadowWidthOnBufferScale, 0);
                rightGradient.addColorStop(0, 'rgba(0,0,0,0.75)');
                rightGradient.addColorStop(0.3, 'rgba(0,0,0,0.5)');
                rightGradient.addColorStop(1, 'rgba(0,0,0,0)');
                visibleCtx.fillStyle = rightGradient;
                visibleCtx.fillRect(spreadCenterOnBufferScale, 0, shadowWidthOnBufferScale, offscreenBuffer.height);
            }

        } else {
            visibleCtx.drawImage(offscreenBuffer, 0, 0);
        }

        const guideScale = OFFSCREEN_RENDER_SCALE; 
        const guideLineWidthFactor = finalDisplayScale; 

        const trimWidthSinglePagePt = trimWidthInches * INCH_TO_POINTS;
        const trimHeightSinglePagePt = trimHeightInches * INCH_TO_POINTS;
        const bleedSinglePagePt = bleedInchesInternal * INCH_TO_POINTS;
        const safetyMarginSinglePagePt = safetyMarginInchesInternal * INCH_TO_POINTS;

        for (let i = 0; i < pagesInView.length; i++) {
            let pageOffsetX_on_offscreen = 0;
            if (isSpread) {
                const isFirstPageOfSpread = (readingDirection === 'ltr' && i === 0) || (readingDirection === 'rtl' && i === 1);
            
                if (isFirstPageOfSpread) { // Left page
                    pageOffsetX_on_offscreen = 0;
                } else { // Right page
                    // Since gutter is 0, the second page's content starts where the first one's ends.
                    pageOffsetX_on_offscreen = (originalPageSize.width - 2 * bleedSinglePagePt) * guideScale + gutterOnBufferScale;
                }
            }
            
            const singlePageContentCenterX_on_offscreen = pageOffsetX_on_offscreen + (originalPageSize.width * guideScale) / 2;
            const singlePageContentCenterY_on_offscreen = (originalPageSize.height * guideScale) / 2;

            const trimBox_x_on_offscreen = singlePageContentCenterX_on_offscreen - (trimWidthSinglePagePt * guideScale) / 2;
            const trimBox_y_on_offscreen = singlePageContentCenterY_on_offscreen - (trimHeightSinglePagePt * guideScale) / 2;
            const trimWidth_on_offscreen = trimWidthSinglePagePt * guideScale;
            const trimHeight_on_offscreen = trimHeightSinglePagePt * guideScale;
            const bleed_on_offscreen = bleedSinglePagePt * guideScale;
            const safetyMargin_on_offscreen = safetyMarginSinglePagePt * guideScale;
            
            if (showBleedGuide && bleed_on_offscreen > 0) {
                visibleCtx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                visibleCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                visibleCtx.lineWidth = Math.max(0.5, 1 / guideLineWidthFactor);
                const isGutteredBookSpread = isSpread && (bindingType === 'saddleStitch' || bindingType === 'perfectBound');
                const isLeftPageInSpread = isSpread && ((readingDirection === 'ltr' && i === 0) || (readingDirection === 'rtl' && i === 1));
            
                const outer_x = trimBox_x_on_offscreen - bleed_on_offscreen;
                const outer_y = trimBox_y_on_offscreen - bleed_on_offscreen;
                const outer_w = trimWidth_on_offscreen + 2 * bleed_on_offscreen;
                const outer_h = trimHeight_on_offscreen + 2 * bleed_on_offscreen;
            
                // Top and Bottom bleed fill
                visibleCtx.fillRect(outer_x, outer_y, outer_w, bleed_on_offscreen);
                visibleCtx.fillRect(outer_x, trimBox_y_on_offscreen + trimHeight_on_offscreen, outer_w, bleed_on_offscreen);
                
                // Left bleed fill
                if (!isGutteredBookSpread || isLeftPageInSpread) {
                    visibleCtx.fillRect(outer_x, trimBox_y_on_offscreen, bleed_on_offscreen, trimHeight_on_offscreen);
                }
                // Right bleed fill
                if (!isGutteredBookSpread || !isLeftPageInSpread) {
                    visibleCtx.fillRect(trimBox_x_on_offscreen + trimWidth_on_offscreen, trimBox_y_on_offscreen, bleed_on_offscreen, trimHeight_on_offscreen);
                }
            
                visibleCtx.setLineDash([Math.max(2, 5 / guideLineWidthFactor), Math.max(1, 3 / guideLineWidthFactor)]);
                if (isGutteredBookSpread) {
                    visibleCtx.beginPath();
                    // Top and bottom lines
                    visibleCtx.moveTo(outer_x, outer_y); visibleCtx.lineTo(outer_x + outer_w, outer_y);
                    visibleCtx.moveTo(outer_x, outer_y + outer_h); visibleCtx.lineTo(outer_x + outer_w, outer_y + outer_h);
                    // Outer vertical line
                    if (isLeftPageInSpread) {
                        visibleCtx.moveTo(outer_x, outer_y); visibleCtx.lineTo(outer_x, outer_y + outer_h);
                    } else {
                        visibleCtx.moveTo(outer_x + outer_w, outer_y); visibleCtx.lineTo(outer_x + outer_w, outer_y + outer_h);
                    }
                    visibleCtx.stroke();
                } else {
                    visibleCtx.strokeRect(outer_x, outer_y, outer_w, outer_h);
                }
                visibleCtx.setLineDash([]);
            }
            if (showTrimGuide) {
                visibleCtx.strokeStyle = 'black'; visibleCtx.lineWidth = Math.max(0.75, 1.5 / guideLineWidthFactor);
                visibleCtx.strokeRect(trimBox_x_on_offscreen, trimBox_y_on_offscreen, trimWidth_on_offscreen, trimHeight_on_offscreen);
            }
            if (showSafetyGuide && safetyMargin_on_offscreen > 0) {
                visibleCtx.strokeStyle = 'green'; visibleCtx.lineWidth = Math.max(0.5, 1 / guideLineWidthFactor);
                visibleCtx.setLineDash([Math.max(2, 4 / guideLineWidthFactor), Math.max(2, 4 / guideLineWidthFactor)]);
                const safety_x = trimBox_x_on_offscreen + safetyMargin_on_offscreen; const safety_y = trimBox_y_on_offscreen + safetyMargin_on_offscreen;
                const safety_w = trimWidth_on_offscreen - 2 * safetyMargin_on_offscreen; const safety_h = trimHeight_on_offscreen - 2 * safetyMargin_on_offscreen;
                if (safety_w > 0 && safety_h > 0) visibleCtx.strokeRect(safety_x, safety_y, safety_w, safety_h);
                visibleCtx.setLineDash([]);
            }
        }
        visibleCtx.restore(); 
    }, [
        offscreenContentVersion, originalPageSize, inputFile, error, isLoading, pdfDocProxy, numPages,
        zoomLevel, panState, trimWidthInches, trimHeightInches, bleedInchesInternal, safetyMarginInchesInternal,
        showTrimGuide, showBleedGuide, showSafetyGuide, currentViewIndex, viewMode, readingDirection, getPagesForView, bindingType
    ]);

    useEffect(() => {
        drawDisplayCanvas();
    }, [drawDisplayCanvas]);

    useEffect(() => {
        const previewNode = previewAreaRef.current; if (!previewNode) return;
        const handleResize = () => drawDisplayCanvas(); 
        const resizeObserver = new ResizeObserver(handleResize); resizeObserver.observe(previewNode);
        return () => resizeObserver.disconnect();
    }, [drawDisplayCanvas]);

    const getPointerPosition = useCallback((event: MouseEvent | TouchEvent | WheelEvent, canvasEl: HTMLCanvasElement | null) => {
        if (!canvasEl) return { x: 0, y: 0 }; const rect = canvasEl.getBoundingClientRect();
        const x = 'touches' in event ? event.touches[0].clientX : event.clientX;
        const y = 'touches' in event ? event.touches[0].clientY : event.clientY;
        return { x: x - rect.left, y: y - rect.top };
    }, []);

    const handlePanStart = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (!layoutMetricsRef.current || !offscreenPageCanvasRef.current) return;
        const { finalDisplayScale, visibleCanvasWidth, visibleCanvasHeight } = layoutMetricsRef.current;
        const displayedContentWidth = offscreenPageCanvasRef.current.width * finalDisplayScale;
        const displayedContentHeight = offscreenPageCanvasRef.current.height * finalDisplayScale;
        const isCurrentlyPannable = zoomLevel > 1.0 || displayedContentWidth > visibleCanvasWidth || displayedContentHeight > visibleCanvasHeight;
        if (!isCurrentlyPannable) return;
        if ('touches' in event && event.touches.length > 1) return;
        if ('preventDefault' in event.nativeEvent && event.nativeEvent.cancelable) event.nativeEvent.preventDefault();
        setIsPanning(true); const pointerPos = getPointerPosition(event.nativeEvent, canvasRef.current);
        panStartPointRef.current = { x: pointerPos.x - panState.x, y: pointerPos.y - panState.y };
    }, [zoomLevel, panState, getPointerPosition]);

    const handlePanMove = useCallback((event: MouseEvent | TouchEvent) => {
        if (!isPanning || !panStartPointRef.current || !layoutMetricsRef.current || !offscreenPageCanvasRef.current) return;
        if ('touches' in event && event.touches.length > 1) { setIsPanning(false); panStartPointRef.current = null; return; }
        if (event.cancelable) event.preventDefault();
        const pointerPos = getPointerPosition(event, canvasRef.current);
        let newX = pointerPos.x - panStartPointRef.current.x; let newY = pointerPos.y - panStartPointRef.current.y;
        const { finalDisplayScale, visibleCanvasWidth, visibleCanvasHeight } = layoutMetricsRef.current;
        const displayedContentWidth = offscreenPageCanvasRef.current.width * finalDisplayScale;
        const displayedContentHeight = offscreenPageCanvasRef.current.height * finalDisplayScale;
        const overpanLimitFactor = 0.05; 
        const maxPanX = Math.max(0, (displayedContentWidth - visibleCanvasWidth) / 2 + visibleCanvasWidth * overpanLimitFactor);
        const minPanX = -maxPanX; const maxPanY = Math.max(0, (displayedContentHeight - visibleCanvasHeight) / 2 + visibleCanvasHeight * overpanLimitFactor);
        const minPanY = -maxPanY; newX = Math.max(minPanX, Math.min(maxPanX, newX)); newY = Math.max(minPanY, Math.min(maxPanY, newY));
        setPanState({ x: newX, y: newY });
    }, [isPanning, getPointerPosition]);

    const handlePanEnd = useCallback(() => {
        setIsPanning(false);
        if (layoutMetricsRef.current && offscreenPageCanvasRef.current) {
            const { finalDisplayScale, visibleCanvasWidth, visibleCanvasHeight } = layoutMetricsRef.current;
            const displayedContentWidth = offscreenPageCanvasRef.current.width * finalDisplayScale;
            const displayedContentHeight = offscreenPageCanvasRef.current.height * finalDisplayScale;
            const hardMaxPanX = Math.max(0, (displayedContentWidth - visibleCanvasWidth) / 2);
            const hardMinPanX = -hardMaxPanX; const hardMaxPanY = Math.max(0, (displayedContentHeight - visibleCanvasHeight) / 2);
            const hardMinPanY = -hardMaxPanY;
            setPanState(currentPan => ({ x: Math.max(hardMinPanX, Math.min(hardMaxPanX, currentPan.x)), y: Math.max(hardMinPanY, Math.min(hardMaxPanY, currentPan.y)), }));
        }
    }, []);

    const handleWheelZoom = useCallback((event: WheelEvent) => {
        if (!layoutMetricsRef.current || !canvasRef.current || !offscreenPageCanvasRef.current) return;
        event.preventDefault();
        const { baseScaleToFitOffscreenToVisible, displayOriginX, displayOriginY, visibleCanvasWidth, visibleCanvasHeight } = layoutMetricsRef.current;
        const mousePos = getPointerPosition(event, canvasRef.current);
        const currentFinalDisplayScale = baseScaleToFitOffscreenToVisible * zoomLevel;
        const mouseX_on_offscreen_content = (mousePos.x - displayOriginX) / currentFinalDisplayScale;
        const mouseY_on_offscreen_content = (mousePos.y - displayOriginY) / currentFinalDisplayScale;
        const zoomDirection = event.deltaY < 0 ? 1 : -1;
        let newZoomLevel = zoomLevel * (1 + zoomDirection * ZOOM_STEP_WHEEL);
        newZoomLevel = Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, newZoomLevel));
        if (newZoomLevel === zoomLevel) return;
        const newFinalDisplayScale = baseScaleToFitOffscreenToVisible * newZoomLevel;
        const newPanX = mousePos.x - (mouseX_on_offscreen_content * newFinalDisplayScale) - (visibleCanvasWidth - (offscreenPageCanvasRef.current.width * newFinalDisplayScale)) / 2;
        const newPanY = mousePos.y - (mouseY_on_offscreen_content * newFinalDisplayScale) - (visibleCanvasHeight - (offscreenPageCanvasRef.current.height * newFinalDisplayScale)) / 2;
        const displayedContentWidthNew = offscreenPageCanvasRef.current.width * newFinalDisplayScale;
        const displayedContentHeightNew = offscreenPageCanvasRef.current.height * newFinalDisplayScale;
        const hardMaxPanX = Math.max(0, (displayedContentWidthNew - visibleCanvasWidth) / 2);
        const hardMinPanX = -hardMaxPanX; const hardMaxPanY = Math.max(0, (displayedContentHeightNew - visibleCanvasHeight) / 2);
        const hardMinPanY = -hardMaxPanY;
        setZoomLevel(newZoomLevel);
        setPanState({ x: Math.max(hardMinPanX, Math.min(hardMaxPanX, newPanX)), y: Math.max(hardMinPanY, Math.min(hardMaxPanY, newPanY)), });
    }, [zoomLevel, panState, getPointerPosition]);

    useEffect(() => {
        const previewNode = previewAreaRef.current; if (!previewNode) return;
        const currentPanMove = (e: MouseEvent) => handlePanMove(e); const currentPanEnd = () => handlePanEnd();
        const currentTouchMove = (e: TouchEvent) => handlePanMove(e); const currentTouchEnd = () => handlePanEnd();
        if (isPanning) {
            window.addEventListener('mousemove', currentPanMove, { passive: false }); window.addEventListener('mouseup', currentPanEnd);
            window.addEventListener('touchmove', currentTouchMove, { passive: false }); window.addEventListener('touchend', currentTouchEnd);
            window.addEventListener('touchcancel', currentTouchEnd);
        }
        const wheelListener = (event: WheelEvent) => handleWheelZoom(event);
        previewNode.addEventListener('wheel', wheelListener, { passive: false });
        return () => {
            window.removeEventListener('mousemove', currentPanMove); window.removeEventListener('mouseup', currentPanEnd);
            window.removeEventListener('touchmove', currentTouchMove); window.removeEventListener('touchend', currentTouchEnd);
            window.removeEventListener('touchcancel', currentTouchEnd);
            if (previewNode) previewNode.removeEventListener('wheel', wheelListener);
        };
    }, [isPanning, handlePanMove, handlePanEnd, handleWheelZoom]);
    
    const handleZoomIn = () => setZoomLevel(prev => Math.min(MAX_ZOOM_LEVEL, prev * (1 + ZOOM_STEP_BUTTON)));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(MIN_ZOOM_LEVEL, prev / (1 + ZOOM_STEP_BUTTON)));
    const handleZoomReset = () => { setZoomLevel(1.0); setPanState({x:0, y:0}); };

    const cursorStyle = isPanning ? 'grabbing' : ((layoutMetricsRef.current && offscreenPageCanvasRef.current && (zoomLevel > 1.0 || (offscreenPageCanvasRef.current.width * layoutMetricsRef.current.finalDisplayScale > layoutMetricsRef.current.visibleCanvasWidth || offscreenPageCanvasRef.current.height * layoutMetricsRef.current.finalDisplayScale > layoutMetricsRef.current.visibleCanvasHeight))) ? 'grab' : 'default');
    const controlsDisabled = !inputFile || !pdfDocProxy || isLoading || isExporting; 

    const presetOptions = [{ value: 'custom', label: 'Custom Size' }, ...STANDARD_PAPER_SIZES.map(s => ({ value: s.name, label: s.name }))]

    const drawGuidesOnPdfLibPage = (
        targetPage: PDFLibPage,
        pageContentOriginalWidthPt: number, 
        pageContentOriginalHeightPt: number,
        artworkBoxOnPage: PDFLibBox, 
        lib: { rgb: typeof window.PDFLib.rgb },
        options: { isSpread: boolean; isLeftPage: boolean; isSaddle: boolean; }
    ) => {
        const trimWidth_pt_config = trimWidthInches * INCH_TO_POINTS;
        const trimHeight_pt_config = trimHeightInches * INCH_TO_POINTS;
        const bleed_pt_config = bleedInchesInternal * INCH_TO_POINTS;
        const safety_pt_config = safetyMarginInchesInternal * INCH_TO_POINTS;
        const redColor = lib.rgb(1, 0, 0); const blackColor = lib.rgb(0, 0, 0); const greenColor = lib.rgb(0, 0.5, 0);
        const scaleX = artworkBoxOnPage.width / pageContentOriginalWidthPt;
        const scaleY = artworkBoxOnPage.height / pageContentOriginalHeightPt;
        const guideDrawScale = Math.min(scaleX, scaleY); 
        const trimWidth_on_artwork = trimWidth_pt_config * guideDrawScale;
        const trimHeight_on_artwork = trimHeight_pt_config * guideDrawScale;
        const artworkCenterX = artworkBoxOnPage.x + artworkBoxOnPage.width / 2;
        const artworkCenterY = artworkBoxOnPage.y + artworkBoxOnPage.height / 2;
        const trimX_on_artwork = artworkCenterX - trimWidth_on_artwork / 2;
        const trimY_on_artwork = artworkCenterY - trimHeight_on_artwork / 2;
        const bleed_on_artwork = bleed_pt_config * guideDrawScale;
        const safety_on_artwork = safety_pt_config * guideDrawScale;

        if (showBleedGuide && bleed_on_artwork > 0) {
            const { isSpread, isLeftPage, isSaddle } = options;
            const isSaddleSpread = isSpread && isSaddle;
        
            const bleedOuterX = trimX_on_artwork - bleed_on_artwork;
            const bleedOuterY = trimY_on_artwork - bleed_on_artwork;
            const bleedOuterWidth = trimWidth_on_artwork + 2 * bleed_on_artwork;
            const bleedOuterHeight = trimHeight_on_artwork + 2 * bleed_on_artwork;
            
            // Top and bottom fill
            targetPage.drawRectangle({ x: bleedOuterX, y: bleedOuterY, width: bleedOuterWidth, height: bleed_on_artwork, color: redColor, opacity: 0.2 });
            targetPage.drawRectangle({ x: bleedOuterX, y: trimY_on_artwork + trimHeight_on_artwork, width: bleedOuterWidth, height: bleed_on_artwork, color: redColor, opacity: 0.2 });
            
            // Left fill
            if (!isSaddleSpread || isLeftPage) {
                targetPage.drawRectangle({ x: bleedOuterX, y: trimY_on_artwork, width: bleed_on_artwork, height: trimHeight_on_artwork, color: redColor, opacity: 0.2 });
            }
            // Right fill
            if (!isSaddleSpread || !isLeftPage) {
                targetPage.drawRectangle({ x: trimX_on_artwork + trimWidth_on_artwork, y: trimY_on_artwork, width: bleed_on_artwork, height: trimHeight_on_artwork, color: redColor, opacity: 0.2 });
            }
        
            // Solid outline for bleed area, respecting saddle stitch
            const lineOptions = { thickness: 0.5, color: redColor, opacity: 0.5 };
            const left = bleedOuterX;
            const right = bleedOuterX + bleedOuterWidth;
            const top = bleedOuterY + bleedOuterHeight;
            const bottom = bleedOuterY;

            // Top and Bottom Lines
            targetPage.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, ...lineOptions });
            targetPage.drawLine({ start: { x: left, y: bottom }, end: { x: right, y: bottom }, ...lineOptions });
            
            if (isSaddleSpread) {
                if (isLeftPage) {
                    // Left vertical line only
                    targetPage.drawLine({ start: { x: left, y: bottom }, end: { x: left, y: top }, ...lineOptions });
                } else {
                    // Right vertical line only
                    targetPage.drawLine({ start: { x: right, y: bottom }, end: { x: right, y: top }, ...lineOptions });
                }
            } else {
                // For non-saddle-spreads or single pages, draw both vertical lines
                targetPage.drawLine({ start: { x: left, y: bottom }, end: { x: left, y: top }, ...lineOptions });
                targetPage.drawLine({ start: { x: right, y: bottom }, end: { x: right, y: top }, ...lineOptions });
            }
        }
        if (showTrimGuide) targetPage.drawRectangle({ x: trimX_on_artwork, y: trimY_on_artwork, width: trimWidth_on_artwork, height: trimHeight_on_artwork, borderColor: blackColor, borderWidth: 1 });
        if (showSafetyGuide && safety_on_artwork > 0) {
            const safetyX = trimX_on_artwork + safety_on_artwork; const safetyY = trimY_on_artwork + safety_on_artwork;
            const safetyWidth = trimWidth_on_artwork - 2 * safety_on_artwork; const safetyHeight = trimHeight_on_artwork - 2 * safety_on_artwork;
            if (safetyWidth > 0 && safetyHeight > 0) targetPage.drawRectangle({ x: safetyX, y: safetyY, width: safetyWidth, height: safetyHeight, borderColor: greenColor, borderWidth: 0.75, borderDashArray: [4, 4] });
        }
    };
    
    const handleExportProof = async () => {
        if (!pdfDocProxy || !originalPageSize || !inputFile || !window.PDFLib) { setError("Cannot export: PDF not fully loaded or essential library missing."); return; }
        setIsExporting(true); setProofingExportProgress(0); setError(null);

        try {
            const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
            setProofingExportProgress(5);
            const exportDoc = await PDFDocument.create();
            
            // Generate shadow images if needed for perfect bound books
            const shadowImages = bindingType === 'perfectBound' ? await createShadowImagesForPdf(exportDoc) : { left: null, right: null };

            const helvetica = await exportDoc.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await exportDoc.embedFont(StandardFonts.HelveticaBold);
            const black = rgb(0,0,0); const red = rgb(1,0,0); const green = rgb(0,0.5,0); const gray = rgb(0.3, 0.3, 0.3);
            setProofingExportProgress(10);

            const clientFirstPageProxy = await pdfDocProxy.getPage(1);
            const clientFirstPageViewportOriginal = clientFirstPageProxy.getViewport({ scale: 1.0 }); 
            const clientFirstPageOriginalWidthPt = clientFirstPageViewportOriginal.width;
            const clientFirstPageOriginalHeightPt = clientFirstPageViewportOriginal.height;
            const clientFirstPageViewportForImage = clientFirstPageProxy.getViewport({ scale: EXPORT_PAGE_RENDER_SCALE });
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = clientFirstPageViewportForImage.width; tempCanvas.height = clientFirstPageViewportForImage.height;
            const tempCtx = tempCanvas.getContext('2d'); if (!tempCtx) throw new Error("Failed to get temp canvas context for export.");
            await clientFirstPageProxy.render({ canvasContext: tempCtx, viewport: clientFirstPageViewportForImage }).promise;
            setProofingExportProgress(15);
            const artworkPngBytes = await new Promise<Uint8Array>((resolve, reject) => { tempCanvas.toBlob(blob => { if (!blob) { reject(new Error("Canvas toBlob failed.")); return; } const reader = new FileReader(); reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.onerror = reject; reader.readAsArrayBuffer(blob); }, 'image/png'); });
            const artworkImage = await exportDoc.embedPng(artworkPngBytes);
            setProofingExportProgress(20);
            const annotatedPage = exportDoc.addPage([clientFirstPageOriginalWidthPt, clientFirstPageOriginalHeightPt]);
            const safetyMarginPt_config = safetyMarginInchesInternal * INCH_TO_POINTS; const annotationBoxPadding = 0.125 * INCH_TO_POINTS;
            const annotationBoxHeight = Math.min(clientFirstPageOriginalHeightPt * 0.3, 1.5 * INCH_TO_POINTS); 
            const annotationBoxX = safetyMarginPt_config + annotationBoxPadding; const annotationBoxY = safetyMarginPt_config + annotationBoxPadding;
            const annotationBoxWidth = clientFirstPageOriginalWidthPt - 2 * (safetyMarginPt_config + annotationBoxPadding);
            const artworkAreaX = safetyMarginPt_config; const artworkAreaY = annotationBoxY + annotationBoxHeight + annotationBoxPadding; 
            const artworkAreaWidth = clientFirstPageOriginalWidthPt - 2 * safetyMarginPt_config;
            const artworkAreaHeight = clientFirstPageOriginalHeightPt - artworkAreaY - safetyMarginPt_config;
            if (artworkAreaWidth <=0 || artworkAreaHeight <=0 || annotationBoxWidth <=0 || annotationBoxHeight <=0) throw new Error("Calculated artwork or annotation area has invalid dimensions.");
            const artworkScaleToFit = Math.min(artworkAreaWidth / artworkImage.width, artworkAreaHeight / artworkImage.height, 1);
            const displayedArtworkWidth = artworkImage.width * artworkScaleToFit; const displayedArtworkHeight = artworkImage.height * artworkScaleToFit;
            const artworkDrawX = artworkAreaX + (artworkAreaWidth - displayedArtworkWidth) / 2; 
            const artworkDrawY = artworkAreaY + (artworkAreaHeight - displayedArtworkHeight) / 2;
            annotatedPage.drawImage(artworkImage, { x: artworkDrawX, y: artworkDrawY, width: displayedArtworkWidth, height: displayedArtworkHeight });
            drawGuidesOnPdfLibPage(annotatedPage, clientFirstPageOriginalWidthPt, clientFirstPageOriginalHeightPt, { x: artworkDrawX, y: artworkDrawY, width: displayedArtworkWidth, height: displayedArtworkHeight }, { rgb }, { isSpread: false, isLeftPage: false, isSaddle: false });
            annotatedPage.drawRectangle({ x: annotationBoxX, y: annotationBoxY, width: annotationBoxWidth, height: annotationBoxHeight, borderColor: gray, borderWidth: 0.5, color: rgb(0.98, 0.98, 0.98) });
            const legendFontSize = Math.max(6, Math.min(8, annotationBoxHeight / 7)); const legendLineHeight = legendFontSize * 1.4;
            const textIndent = annotationBoxX + annotationBoxPadding * 2; const textMaxWidth = annotationBoxWidth - 2 * (annotationBoxPadding * 2);
            let currentTextY = annotationBoxY + annotationBoxHeight - annotationBoxPadding; 
            currentTextY = await drawTextWithWrap(annotatedPage, 'Proof Annotations:', textIndent, currentTextY, textMaxWidth, legendLineHeight, helveticaBold, legendFontSize + 1, black);
            if (showTrimGuide) currentTextY = await drawTextWithWrap(annotatedPage, 'Black Line: Final Trim Size (Cut Line)', textIndent, currentTextY, textMaxWidth, legendLineHeight, helvetica, legendFontSize, black);
            if (showBleedGuide && bleedInchesInternal > 0) currentTextY = await drawTextWithWrap(annotatedPage, 'Red Area/Dashed Line: Bleed Margin (artwork extends to this line and will be trimmed off)', textIndent, currentTextY, textMaxWidth, legendLineHeight, helvetica, legendFontSize, red);
            if (showSafetyGuide && safetyMarginInchesInternal > 0) currentTextY = await drawTextWithWrap(annotatedPage, 'Green Dashed Line: Safety Margin (keep important text & graphics inside this line)', textIndent, currentTextY, textMaxWidth, legendLineHeight, helvetica, legendFontSize, green);
            const disclaimerY = annotationBoxY + annotationBoxPadding + helvetica.heightAtSize(legendFontSize-1);
            await drawTextWithWrap(annotatedPage, 'This is a visual proof for layout purposes. Colors may vary between screen and final print.', textIndent, disclaimerY , textMaxWidth, legendLineHeight * 0.9, helvetica, legendFontSize - 1, gray);
            setProofingExportProgress(25);

            const totalClientPages = pdfDocProxy.numPages;
            const loopStartProgress = 25; const loopProgressRange = 70; 

            const numExportViews = viewMode === 'single' ? totalClientPages : (1 + (totalClientPages > 1 ? Math.ceil((totalClientPages - 1) / 2) : 0));

            for (let viewIdx = 0; viewIdx < numExportViews; viewIdx++) {
                const pagesForThisExportView = getPagesForView(viewIdx, totalClientPages, viewMode);
                if (pagesForThisExportView.length === 0) continue;

                const isSpreadExport = pagesForThisExportView.length === 2;
                const bleedPt = bleedInchesInternal * INCH_TO_POINTS;
                let exportPageWidthPt;
                if (isSpreadExport) {
                    exportPageWidthPt = (2 * originalPageSize.width) - (2 * bleedPt);
                } else {
                    exportPageWidthPt = originalPageSize.width;
                }
                const exportPageHeightPt = originalPageSize.height;
                const proofPage = exportDoc.addPage([exportPageWidthPt, exportPageHeightPt]);

                const artworkBoxes: { artworkBox: PDFLibBox; isLeftPage: boolean; }[] = [];

                // 1. DRAW PAGE CONTENT
                for (let i = 0; i < pagesForThisExportView.length; i++) {
                    const clientPageNum = pagesForThisExportView[i];
                    const clientPageProxyLoop = await pdfDocProxy.getPage(clientPageNum);
                    const clientPageViewportForImageLoop = clientPageProxyLoop.getViewport({ scale: EXPORT_PAGE_RENDER_SCALE });
                    tempCanvas.width = clientPageViewportForImageLoop.width; tempCanvas.height = clientPageViewportForImageLoop.height;
                    await clientPageProxyLoop.render({ canvasContext: tempCtx!, viewport: clientPageViewportForImageLoop }).promise;
                    const pagePngBytes = await new Promise<Uint8Array>((resolve, reject) => { tempCanvas.toBlob(blob => { if (!blob) { reject(new Error("Page canvas toBlob failed for page " + clientPageNum)); return; } const reader = new FileReader(); reader.onloadend = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.onerror = reject; reader.readAsArrayBuffer(blob); }, 'image/png'); });
                    const pageImage = await exportDoc.embedPng(pagePngBytes);
                    
                    const isFirstPageOfPair = (clientPageNum === pagesForThisExportView[0]);
                    const isLeftPageInSpread = isSpreadExport && ((readingDirection === 'ltr') ? isFirstPageOfPair : !isFirstPageOfPair);
            
                    let drawXOnExportPage = 0;
                    if (isSpreadExport) {
                        if (!isLeftPageInSpread) {
                           drawXOnExportPage = originalPageSize.width - (2 * bleedPt);
                        }
                    }

                    proofPage.drawImage(pageImage, { x: drawXOnExportPage, y: 0, width: originalPageSize.width, height: originalPageSize.height });
                    const artworkBox = { x: drawXOnExportPage, y: 0, width: originalPageSize.width, height: originalPageSize.height };
                    artworkBoxes.push({ artworkBox, isLeftPage: isLeftPageInSpread });
                }

                // 2. DRAW SHADOW (for perfect bound spreads)
                if (isSpreadExport && bindingType === 'perfectBound' && shadowImages.left && shadowImages.right) {
                    const shadowWidthPt = 0.5 * INCH_TO_POINTS;
                    const spreadCenterPt = originalPageSize.width - bleedPt;
                    
                    // Left page's shadow (on its right edge)
                    proofPage.drawImage(shadowImages.left, {
                        x: spreadCenterPt - shadowWidthPt,
                        y: 0,
                        width: shadowWidthPt,
                        height: exportPageHeightPt,
                    });
                    
                    // Right page's shadow (on its left edge)
                    proofPage.drawImage(shadowImages.right, {
                        x: spreadCenterPt,
                        y: 0,
                        width: shadowWidthPt,
                        height: exportPageHeightPt,
                    });
                }
                
                // 3. DRAW GUIDES (on top of content and shadow)
                for (const { artworkBox, isLeftPage } of artworkBoxes) {
                    const guideOptions = { isSpread: isSpreadExport, isLeftPage, isSaddle: bindingType === 'saddleStitch' || bindingType === 'perfectBound' };
                    drawGuidesOnPdfLibPage(proofPage, originalPageSize.width, originalPageSize.height, artworkBox, { rgb }, guideOptions);
                }

                const currentLoopProgress = numExportViews > 0 ? ((viewIdx + 1) / numExportViews) * loopProgressRange : loopProgressRange;
                setProofingExportProgress(Math.round(loopStartProgress + currentLoopProgress));
            }
            
            setProofingExportProgress(95);
            const pdfBytes = await exportDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = `${inputFile.name.replace(/\.pdf$/i, '')}_proof.pdf`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
            setProofingExportProgress(100);
        } catch (exportError: any) {
            console.error("Error exporting proof PDF:", exportError); setError(exportError.message || "Failed to export proof PDF.");
            setProofingExportProgress(0);
        } finally {
            setIsExporting(false);
        }
    };


    return (
        <div className="flex flex-col lg:flex-row h-full max-h-[calc(100vh-200px)] gap-4 p-4 bg-white shadow-xl rounded-lg">
            {/* Controls Panel */}
            <div className="lg:w-80 xl:w-96 flex-shrink-0 space-y-4 p-4 border border-gray-200 rounded-md overflow-y-auto scrollbar-thin">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Proofing Setup</h3>
                <FileUploadButton 
                    onFileSelect={handleFileChange} 
                    label={inputFile ? `PDF: ${inputFile.name.substring(0,25)}${inputFile.name.length > 25 ? '...' : ''}` : "Upload PDF"}
                    disabled={isLoading || isExporting}
                />
                 <SelectField
                    id="viewMode"
                    label="View Mode"
                    value={viewMode}
                    options={[ { value: 'single', label: 'Single Page (Normal Print)' }, { value: 'spread', label: 'Spread (Book)' }]}
                    onChange={(val) => setViewMode(val as ViewMode)}
                    disabled={isLoading || isExporting}
                />
                {viewMode === 'spread' && (
                    <>
                    <SelectField
                        id="bindingType"
                        label="Binding Type"
                        value={bindingType}
                        options={BINDING_TYPE_PROOFING_OPTIONS}
                        onChange={(val) => setBindingType(val as BindingTypeProofing)}
                        disabled={isLoading || isExporting}
                    />
                    <SelectField
                        id="readingDirection"
                        label="Reading Direction"
                        value={readingDirection}
                        options={[ { value: 'ltr', label: 'Left-to-Right (LTR)' }, { value: 'rtl', label: 'Right-to-Left (RTL)' }]}
                        onChange={(val) => setReadingDirection(val as ReadingDirection)}
                        disabled={isLoading || isExporting}
                    />
                    </>
                )}
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Units</label>
                    <div className="flex space-x-2">
                        {(['in', 'mm'] as Unit[]).map(unit => (
                            <Button key={unit} onClick={() => setCurrentUnit(unit)} variant={currentUnit === unit ? 'primary' : 'secondary'} className="flex-1 text-xs" disabled={isLoading || isExporting}>
                                {unit === 'in' ? 'Inches (in)' : 'Millimeters (mm)'}
                            </Button>
                        ))}
                    </div>
                </div>
                <SelectField id="presetSize" label="Preset Trim Size" value={selectedPresetName} options={presetOptions} onChange={handlePresetChange} disabled={isLoading || isExporting} />
                <NumberField id="trimWidth" label="Final Trim Width" value={formatNumberForDisplay(trimWidthInches, currentUnit)} onChange={handleTrimWidthChange} unit={currentUnit} min={0.1} step={currentUnit === 'in' ? 0.001 : 0.1} disabled={isLoading || isExporting} />
                <NumberField id="trimHeight" label="Final Trim Height" value={formatNumberForDisplay(trimHeightInches, currentUnit)} onChange={handleTrimHeightChange} unit={currentUnit} min={0.1} step={currentUnit === 'in' ? 0.001 : 0.1} disabled={isLoading || isExporting} />
                <NumberField id="bleed" label="Bleed Amount (per side)" value={formatNumberForDisplay(bleedInchesInternal, currentUnit)} onChange={handleBleedChange} unit={currentUnit} min={0} step={currentUnit === 'in' ? 0.001 : 0.1} disabled={isLoading || isExporting} />
                <NumberField id="safetyMargin" label="Safety Margin (inset)" value={formatNumberForDisplay(safetyMarginInchesInternal, currentUnit)} onChange={handleSafetyMarginChange} unit={currentUnit} min={0} step={currentUnit === 'in' ? 0.001 : 0.1} disabled={isLoading || isExporting} />
                <div className="space-y-2 pt-2 border-t">
                    <h4 className="text-sm font-medium text-gray-700">Guide Visibility</h4>
                    <ToggleSwitch id="showTrim" label="Show Trim Box (Black)" checked={showTrimGuide} onChange={setShowTrimGuide} disabled={isLoading || isExporting} />
                    <ToggleSwitch id="showBleed" label="Show Bleed Area (Red)" checked={showBleedGuide} onChange={setShowBleedGuide} disabled={isLoading || isExporting} />
                    <ToggleSwitch id="showSafety" label="Show Safety Margin (Green)" checked={showSafetyGuide} onChange={setShowSafetyGuide} disabled={isLoading || isExporting} />
                </div>
                 <div className="pt-2 border-t">
                    <Button onClick={handleExportProof} isLoading={isExporting} disabled={controlsDisabled || !inputFile || !pdfDocProxy || !originalPageSize} variant="success" className="w-full mt-4" iconPosition="left">
                        {isExporting ? `Exporting... ${proofingExportProgress}%` : <><Icon iconName="download" className="w-4 h-4 mr-2" />Export Proof PDF</>}
                    </Button>
                    {isExporting && (
                         <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                            <div className="bg-green-600 h-2.5 rounded-full transition-all duration-150 ease-out" style={{ width: `${proofingExportProgress}%` }} role="progressbar" aria-valuenow={proofingExportProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Proofing export progress"></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Panel */}
            <div className="flex-grow flex flex-col min-w-0 min-h-0 border border-gray-200 rounded-md">
                 <div className="flex items-center justify-between p-2 border-b bg-gray-50 flex-wrap gap-2">
                    <div className="flex items-center space-x-1">
                        <button onClick={() => setCurrentViewIndex(0)} disabled={controlsDisabled || currentViewIndex <= 0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="First View"><Icon iconName="chevronsLeft" /></button>
                        <button onClick={() => setCurrentViewIndex(p => Math.max(0,p-1))} disabled={controlsDisabled || currentViewIndex <= 0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="Previous View"><Icon iconName="chevronLeft" /></button>
                    </div>
                    <span className="text-sm text-gray-700">
                        View {totalDisplayableViews > 0 ? currentViewIndex + 1 : 0} of {totalDisplayableViews > 0 ? totalDisplayableViews : (inputFile ? '...' : 0) }
                         {originalPageSize && numPages > 0 && ` (Page(s): ${getPagesForView(currentViewIndex, numPages, viewMode).join(' & ')})`}
                    </span>
                    <div className="flex items-center space-x-1">
                        <button onClick={() => setCurrentViewIndex(p => Math.min(totalDisplayableViews-1, p+1))} disabled={controlsDisabled || currentViewIndex >= totalDisplayableViews -1 || totalDisplayableViews === 0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="Next View"><Icon iconName="chevronRight" /></button>
                        <button onClick={() => setCurrentViewIndex(totalDisplayableViews-1)} disabled={controlsDisabled || currentViewIndex >= totalDisplayableViews -1 || totalDisplayableViews === 0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="Last View"><Icon iconName="chevronsRight" /></button>
                    </div>
                    <div className="flex items-center space-x-1 border-l pl-2 ml-2">
                        <button onClick={handleZoomOut} disabled={controlsDisabled || zoomLevel <= MIN_ZOOM_LEVEL} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="Zoom Out"><Icon iconName="zoomOut" /></button>
                        <button onClick={handleZoomReset} disabled={controlsDisabled || zoomLevel === 1.0} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="Reset Zoom"><Icon iconName="refreshCcw" /></button>
                        <button onClick={handleZoomIn} disabled={controlsDisabled || zoomLevel >= MAX_ZOOM_LEVEL} className="p-1.5 rounded text-slate-700 hover:bg-gray-200 hover:text-indigo-600 disabled:opacity-50 disabled:text-slate-400" title="Zoom In"><Icon iconName="zoomIn" /></button>
                        <span className="text-xs text-gray-600 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                    </div>
                </div>
                <div ref={previewAreaRef} className="flex-grow bg-gray-100 relative overflow-hidden touch-none min-h-0" style={{ cursor: cursorStyle }} onMouseDown={handlePanStart} onTouchStart={handlePanStart} aria-live="polite" aria-atomic="true" >
                    {(isLoading && !isExporting) && (
                        <div className="absolute inset-0 bg-white bg-opacity-75 flex flex-col items-center justify-center z-10 pointer-events-none" aria-hidden="true">
                            <Icon iconName="spinner" className="h-8 w-8 text-indigo-600 mb-2"/>
                            <p className="text-gray-600 text-sm"> {pdfDocProxy ? `Processing View ${currentViewIndex + 1}...` : 'Loading PDF...'} </p>
                        </div>
                    )}
                    <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" aria-label="PDF Proof Preview" aria-hidden={!!(isLoading && !isExporting && !error)} role="img" />
                     {error && !isLoading && (
                        <div className="absolute inset-0 bg-red-50 border border-red-200 flex flex-col items-center justify-center p-4 z-10 pointer-events-none">
                            <Icon iconName="alertTriangle" className="h-8 w-8 text-red-500 mb-2"/>
                            <p className="text-red-700 text-sm text-center">{error}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
