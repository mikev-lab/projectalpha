import { useState, useEffect, useRef } from 'react';
import { PDFDocumentProxy as PDFJSDocumentProxy } from '../types';

interface PdfInfo {
    width: number;
    height: number;
    pageCount: number;
}

interface UsePdfInfoResult {
    pdfDocProxy: PDFJSDocumentProxy | null;
    pdfInfo: PdfInfo | null;
    isLoading: boolean;
    error: string | null;
}

export const usePdfInfo = (inputFile: File | null): UsePdfInfoResult => {
    const [pdfDocProxy, setPdfDocProxy] = useState<PDFJSDocumentProxy | null>(null);
    const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const loadingTaskRef = useRef<any>(null);

    useEffect(() => {
        // Keep a reference to the document that this effect is responsible for creating.
        // This is crucial for the cleanup logic.
        let createdDoc: PDFJSDocumentProxy | null = null;

        if (!inputFile || !window.pdfjsLib) {
            // If there's no file, clear the state. The cleanup function of the *previous*
            // effect run will handle destroying any existing document.
            setPdfDocProxy(null);
            setPdfInfo(null);
            setError(inputFile && !window.pdfjsLib ? "PDF.js library not loaded." : null);
            setIsLoading(false);
            return; // Early exit
        }

        let isMounted = true;
        setIsLoading(true);
        setError(null);
        // We don't clear pdfInfo/pdfDocProxy here, allowing the old preview to stay visible while loading.

        const loadPdf = async () => {
            try {
                const arrayBuffer = await inputFile.arrayBuffer();
                if (!isMounted) return;

                // Create and track the loading task so it can be cancelled.
                const task = window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                loadingTaskRef.current = task;
                const loadedPdfDoc = await task.promise;
                
                if (!isMounted) { 
                    try { loadedPdfDoc.destroy(); } catch(e){} 
                    return; 
                }

                // This effect is now responsible for this new document.
                createdDoc = loadedPdfDoc;

                const firstPage = await loadedPdfDoc.getPage(1);
                const viewport = firstPage.getViewport({ scale: 1 });
                
                if (!isMounted) return; // The cleanup will handle destroying `createdDoc`.

                // SUCCESS: Update the state with the new document and info.
                // The old document is still in the `pdfDocProxy` state until this completes.
                setPdfDocProxy(loadedPdfDoc);
                setPdfInfo({
                    width: viewport.width,
                    height: viewport.height,
                    pageCount: loadedPdfDoc.numPages,
                });

            } catch (e: any) {
                if (isMounted) {
                    console.error("Error loading PDF info:", e);
                    setError(e.message || "Failed to load PDF info.");
                    // On error, clear everything. The cleanup from the previous effect will still run.
                    setPdfDocProxy(null);
                    setPdfInfo(null);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
                loadingTaskRef.current = null;
            }
        };

        loadPdf();

        return () => {
            // This cleanup function runs when `inputFile` changes OR when the component unmounts.
            isMounted = false;

            // If a loading task is in progress, cancel it.
            if (loadingTaskRef.current) {
                loadingTaskRef.current.destroy();
                loadingTaskRef.current = null;
            }

            // If this effect successfully loaded a document (`createdDoc` was set), destroy it.
            // This ensures that we are destroying the document created in *this specific effect run*.
            if (createdDoc) {
                try {
                    createdDoc.destroy();
                } catch (e) {
                    console.warn("Error destroying pdfDocProxy during cleanup", e);
                }
            }
        };
    }, [inputFile]);

    return { pdfDocProxy, pdfInfo, isLoading, error };
};
