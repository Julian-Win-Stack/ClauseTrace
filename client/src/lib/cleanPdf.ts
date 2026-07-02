import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  assembleText,
  type AssembledText,
  type ExtractedItem,
  type ExtractedPage,
} from './assembleAplText';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Extract and clean a DHCS All Plan Letter PDF into plain text, entirely in
 * the browser. This is a lossy convenience step: the result is meant to be
 * reviewed/edited in the paste box before it becomes the canonical full_text,
 * never trusted as source on its own.
 */
export async function cleanPdf(file: File): Promise<AssembledText> {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const pages: ExtractedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: ExtractedItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.length === 0) continue;
        // transform is [a, b, c, d, e, f]: e/f are the position, and the
        // font size is the vertical scale magnitude hypot(c, d).
        const [, , c = 0, d = 0, e = 0, f = 0] = item.transform;
        items.push({
          text: item.str,
          x: e,
          width: item.width,
          yTop: viewport.height - f,
          fontSize: Math.hypot(c, d),
        });
      }
      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }

    const result = assembleText(pages);
    if (result.text.length === 0) {
      throw new Error(
        'No text found in this PDF — it may be a scan. Paste the text manually instead.',
      );
    }
    return result;
  } finally {
    await loadingTask.destroy();
  }
}
