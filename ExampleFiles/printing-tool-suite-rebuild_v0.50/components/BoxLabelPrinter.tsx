
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JobInfoState, PDFDocument, PDFFont } from '../types';
import { 
    INCH_TO_POINTS, LABEL_WIDTH_INCHES, LABEL_HEIGHT_INCHES, LABEL_FONT_SIZES_PT
} from '../constants';
import { TextField } from './TextField';
import { Button } from './Button';
import { Icon } from './Icon';

interface BoxLabelPrinterProps {
  jobInfo: JobInfoState;
  companyName: string;
  onCompanyNameChange: (name: string) => void;
}

interface BoxEntry {
    id: string;
    quantityInBox: string;
}

const formatDateMMDDYY = (dateString: string): string => {
    if (!dateString) return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit'});
    try {
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() + userTimezoneOffset);

        const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
        const day = localDate.getDate().toString().padStart(2, '0');
        const year = localDate.getFullYear().toString().slice(-2);
        return `${month}/${day}/${year}`;
    } catch (e) {
        console.error("Error formatting date:", e);
        return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit'});
    }
};

const getTodayYYYYMMDD = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};


export const BoxLabelPrinter: React.FC<BoxLabelPrinterProps> = ({ jobInfo, companyName, onCompanyNameChange }) => {
  const [boxEntries, setBoxEntries] = useState<BoxEntry[]>([{ id: Date.now().toString(), quantityInBox: (jobInfo.quantity && !isNaN(Number(jobInfo.quantity)) ? jobInfo.quantity : '1') }]);
  const [localCompanyName, setLocalCompanyName] = useState<string>(companyName);
  const [contentsDescriptor, setContentsDescriptor] = useState<string>("");
  const [selectedDatePrinted, setSelectedDatePrinted] = useState<string>(getTodayYYYYMMDD());
  
  const [outputLabelPdfUrl, setOutputLabelPdfUrl] = useState<string | null>(null);
  const [isLabelLoading, setIsLabelLoading] = useState<boolean>(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setLocalCompanyName(companyName);
  }, [companyName]);
  
   useEffect(() => {
    if (boxEntries.length === 1 && jobInfo.quantity && !isNaN(Number(jobInfo.quantity))) {
      setBoxEntries([{ ...boxEntries[0], quantityInBox: jobInfo.quantity }]);
    }
  }, [jobInfo.quantity, boxEntries.length]); // Added boxEntries.length to dependencies


  useEffect(() => {
    // This effect manages the lifecycle of the outputLabelPdfUrl.
    // It revokes the URL when it's no longer needed (i.e., when it changes or component unmounts).
    const urlToRevoke = outputLabelPdfUrl;
    return () => {
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [outputLabelPdfUrl]);
  
  const clearOutput = useCallback(() => {
    setOutputLabelPdfUrl(null); // This will trigger the useEffect above to revoke the old URL
    setLabelError(null);
  }, []);

  const addBoxEntry = () => {
    setBoxEntries(prev => [...prev, { id: Date.now().toString(), quantityInBox: '1' }]);
  };

  const removeBoxEntry = (idToRemove: string) => {
    setBoxEntries(prev => prev.filter(entry => entry.id !== idToRemove));
  };

  const handleBoxEntryChange = (idToUpdate: string, newQuantity: string) => {
    setBoxEntries(prev => 
      prev.map(entry => 
        entry.id === idToUpdate ? { ...entry, quantityInBox: newQuantity } : entry
      )
    );
  };

  const drawLabelContent = (
    ctxOrPage: CanvasRenderingContext2D | any, // PDFPage for pdf-lib
    isPdf: boolean,
    boxIdentifier: string, // e.g., "Box 1 of 3"
    quantityForThisBox: string,
    dateToPrint: string, // MM/DD/YY formatted
    fontForPdf?: PDFFont, // Only for PDF
    pdfLibInstance?: any // PDFLib for pdf-lib
  ) => {
    const labelWidthPt = LABEL_WIDTH_INCHES * INCH_TO_POINTS;
    const labelHeightPt = LABEL_HEIGHT_INCHES * INCH_TO_POINTS;
    const marginPt = 0.25 * INCH_TO_POINTS; 

    const { rgb } = pdfLibInstance || window.PDFLib || {}; 
    const black = isPdf && rgb ? rgb(0,0,0) : 'black';

    const setFontAndFill = (size: number, weight: string = 'normal') => {
      if (isPdf) { /* PDF font setting is part of drawText options */ } 
      else if (ctxOrPage instanceof CanvasRenderingContext2D) {
        ctxOrPage.font = `${weight} ${size}px Arial`;
        ctxOrPage.fillStyle = 'black';
        ctxOrPage.textAlign = 'left';
        ctxOrPage.textBaseline = 'top';
      }
    };

    const drawText = (text: string, x: number, y: number, sizePt: number, pdfFont?: PDFFont) => {
        if (isPdf && ctxOrPage.drawText) {
            ctxOrPage.drawText(text, { x, y, font: pdfFont, size: sizePt, color: black });
        } else if (ctxOrPage instanceof CanvasRenderingContext2D) {
            ctxOrPage.fillText(text, x, y);
        }
    };
    
    const projectOrJobId = jobInfo.jobIdName || "N/A";
    const customer = jobInfo.customerName || "N/A";

    let currentY = marginPt;

    setFontAndFill(LABEL_FONT_SIZES_PT.header, 'bold');
    drawText(customer, marginPt, currentY, LABEL_FONT_SIZES_PT.header, fontForPdf);
    currentY += LABEL_FONT_SIZES_PT.header + (0.1 * INCH_TO_POINTS);

    setFontAndFill(LABEL_FONT_SIZES_PT.subHeader);
    drawText(projectOrJobId, marginPt, currentY, LABEL_FONT_SIZES_PT.subHeader, fontForPdf);
    currentY += LABEL_FONT_SIZES_PT.subHeader + (0.1 * INCH_TO_POINTS);

    setFontAndFill(LABEL_FONT_SIZES_PT.normal, 'bold');
    drawText(boxIdentifier, marginPt, currentY, LABEL_FONT_SIZES_PT.normal, fontForPdf);
    currentY += LABEL_FONT_SIZES_PT.normal + (0.1 * INCH_TO_POINTS);
    
    setFontAndFill(LABEL_FONT_SIZES_PT.normal);
    drawText(`Quantity in Box: ${quantityForThisBox || '0'}`, marginPt, currentY, LABEL_FONT_SIZES_PT.normal, fontForPdf);
    currentY += LABEL_FONT_SIZES_PT.normal + (0.1 * INCH_TO_POINTS);
    
    if (contentsDescriptor) {
        drawText(`Contents: ${contentsDescriptor}`, marginPt, currentY, LABEL_FONT_SIZES_PT.normal, fontForPdf);
        currentY += LABEL_FONT_SIZES_PT.normal + (0.1 * INCH_TO_POINTS);
    }
    
    const bottomMarginY = labelHeightPt - marginPt;
    let printedByY = bottomMarginY - LABEL_FONT_SIZES_PT.normal;
    let datePrintedY = printedByY - LABEL_FONT_SIZES_PT.normal - (0.05 * INCH_TO_POINTS);
    
    setFontAndFill(LABEL_FONT_SIZES_PT.normal);
    drawText(`Printed By: ${localCompanyName || companyName}`, marginPt, printedByY, LABEL_FONT_SIZES_PT.normal, fontForPdf);
    drawText(`Date Printed: ${dateToPrint}`, marginPt, datePrintedY, LABEL_FONT_SIZES_PT.normal, fontForPdf);
  };

  const drawLabelPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || boxEntries.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labelWidthPt = LABEL_WIDTH_INCHES * INCH_TO_POINTS;
    const labelHeightPt = LABEL_HEIGHT_INCHES * INCH_TO_POINTS;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const scaleX = canvas.width / labelWidthPt;
    const scaleY = canvas.height / labelHeightPt;
    const scale = Math.min(scaleX, scaleY); 

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const drawWidth = labelWidthPt * scale;
    const drawHeight = labelHeightPt * scale;
    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, labelWidthPt, labelHeightPt);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1 / scale; 
    ctx.strokeRect(0, 0, labelWidthPt, labelHeightPt);

    const firstEntry = boxEntries[0];
    const boxIdText = `Box 1 of ${boxEntries.length}`;
    const qtyText = firstEntry.quantityInBox;
    const formattedPrintDate = formatDateMMDDYY(selectedDatePrinted);

    drawLabelContent(ctx, false, boxIdText, qtyText, formattedPrintDate);
    ctx.restore();

  }, [jobInfo, localCompanyName, companyName, contentsDescriptor, boxEntries, selectedDatePrinted]);

  useEffect(() => {
    drawLabelPreview();
  }, [drawLabelPreview]);


  const generateLabelPdf = async () => {
    if (!window.PDFLib || !window.PDFLib.PDFDocument || !window.PDFLib.StandardFonts) {
      setLabelError("PDFLib not loaded. Please refresh.");
      return;
    }
    if (boxEntries.some(entry => !entry.quantityInBox.trim() || isNaN(Number(entry.quantityInBox)))) {
      setLabelError("Please ensure all box quantities are valid numbers.");
      return;
    }

    setIsLabelLoading(true);
    setLabelError(null);
    setOutputLabelPdfUrl(null); // Clear previous URL, triggering its revocation via useEffect

    try {
      const { PDFDocument, StandardFonts } = window.PDFLib;
      const outputPdfDoc = await PDFDocument.create();
      const helveticaFont = await outputPdfDoc.embedFont(StandardFonts.Helvetica);
      
      const labelWidthPt = LABEL_WIDTH_INCHES * INCH_TO_POINTS;
      const labelHeightPt = LABEL_HEIGHT_INCHES * INCH_TO_POINTS;
      const formattedPrintDate = formatDateMMDDYY(selectedDatePrinted);

      for (let i = 0; i < boxEntries.length; i++) {
        const entry = boxEntries[i];
        const page = outputPdfDoc.addPage([labelWidthPt, labelHeightPt]);
        const boxIdText = `Box ${i + 1} of ${boxEntries.length}`;
        drawLabelContent(page, true, boxIdText, entry.quantityInBox, formattedPrintDate, helveticaFont, window.PDFLib);
      }
      
      const pdfBytes = await outputPdfDoc.save();
      if (!pdfBytes || pdfBytes.length === 0) {
        throw new Error("Generated PDF has no content.");
      }
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setOutputLabelPdfUrl(url); // Set the new URL, effect will track it

    } catch (e: any) {
      console.error("Error generating label PDF:", e);
      setLabelError(e.message || "Failed to generate label PDF.");
      setOutputLabelPdfUrl(null); // Ensure URL is cleared on error
    } finally {
      setIsLabelLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-2xl rounded-lg p-6 sm:p-8 space-y-6">
      <div className="border-b border-gray-200 pb-5">
        <h2 className="text-xl leading-6 font-semibold text-gray-900 flex items-center">
          <Icon iconName="settings" className="w-6 h-6 mr-3 text-cyan-600" />
          Box Label Printer (4" x 6" Landscape)
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Generate simple labels for boxes, suitable for thermal printers. Uses info from the Job Information tab.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Inputs & Settings */}
        <div className="md:col-span-1 space-y-4">
          <h3 className="text-md font-medium text-gray-800">Label Settings</h3>
          <TextField 
            id="labelCompanyName"
            label="Company Name (Printed By)"
            value={localCompanyName}
            onChange={(val) => { setLocalCompanyName(val); onCompanyNameChange(val); }}
            placeholder="Your Company Name"
          />
          <TextField 
            id="labelContentsDescriptor"
            label="Contents Descriptor"
            value={contentsDescriptor}
            onChange={setContentsDescriptor}
            placeholder="e.g., Books - Interior, Final Product"
          />
          <TextField
            id="datePrinted"
            label="Date Printed"
            type="date"
            value={selectedDatePrinted}
            onChange={setSelectedDatePrinted}
          />

          <div className="space-y-3 mt-4 border-t pt-4">
             <h4 className="text-sm font-medium text-gray-700">Box Quantities:</h4>
            {boxEntries.map((entry, index) => (
              <div key={entry.id} className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 whitespace-nowrap">Box {index + 1}:</span>
                <TextField 
                  id={`boxqty-${entry.id}`}
                  label="" 
                  value={entry.quantityInBox}
                  onChange={(val) => handleBoxEntryChange(entry.id, val)}
                  placeholder="Qty"
                  className="flex-grow !mt-0" 
                  type="text" 
                />
                {boxEntries.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => removeBoxEntry(entry.id)}
                    className="p-1 text-red-500 hover:text-red-700"
                    aria-label={`Remove Box ${index + 1}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <Button onClick={addBoxEntry} variant="secondary" className="w-full text-sm py-1.5">
              Add Another Box
            </Button>
          </div>


          <Button
            onClick={generateLabelPdf}
            isLoading={isLabelLoading}
            disabled={isLabelLoading || boxEntries.length === 0 || boxEntries.some(e => !e.quantityInBox.trim() || isNaN(Number(e.quantityInBox)))}
            className="w-full mt-4"
            variant="success"
          >
            {isLabelLoading ? 'Generating...' : `Generate ${boxEntries.length} Label(s) PDF`}
          </Button>
          {labelError && (
            <p className="text-sm text-red-600 mt-2">{labelError}</p>
          )}
          {outputLabelPdfUrl && (
            <a
              href={outputLabelPdfUrl}
              download={`box-labels-${jobInfo.jobIdName?.replace(/[^a-z0-9_.-]/gi, '_') || 'job'}.pdf`}
              className="mt-2 inline-flex w-full items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <Icon iconName="download" className="w-5 h-5 mr-2" />
              Download Labels PDF
            </a>
          )}
        </div>

        {/* Column 2: Label Preview */}
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-md font-medium text-gray-800">Label Preview (4" x 6")</h3>
          <div className="w-full aspect-[6/4] bg-gray-100 border border-gray-300 rounded-md p-2 flex items-center justify-center overflow-hidden">
            <canvas 
                ref={previewCanvasRef} 
                className="max-w-full max-h-full object-contain"
                style={{width: '100%', height: '100%'}} 
            ></canvas>
          </div>
           <div className="text-xs text-gray-500">
            Preview shows the first box. PDF will contain one label for each box entry defined.
          </div>
        </div>
      </div>

      <div className="mt-6 border-t pt-6">
        <h3 className="text-md font-medium text-gray-800 mb-2">Reference: Current Job Information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm bg-slate-50 p-3 rounded-md">
            <p><strong className="text-slate-600">Job ID/Name:</strong> {jobInfo.jobIdName || 'N/A'}</p>
            <p><strong className="text-slate-600">Customer:</strong> {jobInfo.customerName || 'N/A'}</p>
            <p><strong className="text-slate-600">Total Qty (from Job Info):</strong> {jobInfo.quantity || 'N/A'}</p>
            <p><strong className="text-slate-600">File Name:</strong> {jobInfo.fileNameTitle || 'N/A'}</p>
        </div>
      </div>
    </div>
  );
};
