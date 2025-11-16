import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PDFDocument } from 'pdf-lib';

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return new NextResponse('Project ID is required', { status: 400 });
    }

    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await getDoc(projectRef);

    if (!projectSnap.exists()) {
      return new NextResponse('Project not found', { status: 404 });
    }

    const projectData = projectSnap.data();
    // Assuming projectData contains a URL to the PDF file
    const pdfUrl = projectData.pdfUrl;

    if (!pdfUrl) {
        return new NextResponse('PDF URL not found for the project', { status: 404 });
    }

    // This is a simplified imposition logic. A real implementation would be more complex.
    const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const newDoc = await PDFDocument.create();

    const [page1] = await newDoc.copyPages(pdfDoc, [0]);
    const [page2] = await newDoc.copyPages(pdfDoc, [1]);

    const page = newDoc.addPage();
    page.drawPage(page1, { x: 0, y: page.getHeight() / 2, width: page.getWidth(), height: page.getHeight() / 2 });
    page.drawPage(page2, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() / 2 });

    const pdfBytes = await newDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="imposition-${projectId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Imposition Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
