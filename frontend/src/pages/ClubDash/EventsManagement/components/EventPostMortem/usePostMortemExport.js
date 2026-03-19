import { useCallback } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const HTML2CANVAS_SCALE = 2;
const PDF_PAGE_TOP_PADDING_MM = 8;

/**
 * Get safe cut points (y positions in canvas px) where we can slice without splitting
 * elements marked with data-pdf-no-split. Positions are relative to the element.
 */
function getSafeCutPoints(element) {
    const elRect = element.getBoundingClientRect();
    const noSplitEls = element.querySelectorAll('[data-pdf-no-split]');
    const points = new Set([0, elRect.height]);

    noSplitEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const top = rect.top - elRect.top;
        const bottom = top + rect.height;
        if (top > 0) points.add(top);
        if (bottom < elRect.height) points.add(bottom);
    });

    return Array.from(points).sort((a, b) => a - b);
}

/**
 * Find the largest safe cut point <= maxY (in canvas pixels).
 * Safe cut points are scaled by HTML2CANVAS_SCALE for canvas coordinates.
 */
function findSliceEnd(safeCutPointsScaled, yOffset, maxY) {
    let best = yOffset;
    for (const pt of safeCutPointsScaled) {
        if (pt > yOffset && pt <= maxY) best = pt;
    }
    return best;
}

/**
 * Captures the visible post-mortem content and exports as PDF.
 * Slices only at element boundaries (data-pdf-no-split) so sections are never cut in half.
 */
export function usePostMortemExport() {
    const exportToPdf = useCallback(async ({
        event,
        addNotification,
        pdfContentRef
    }) => {
        if (!event?.name) {
            addNotification?.({ title: 'Error', message: 'Missing event data', type: 'error' });
            return;
        }

        const element = pdfContentRef?.current;
        if (!element) {
            addNotification?.({ title: 'Error', message: 'Could not find content to export', type: 'error' });
            return;
        }

        try {
            // Brief delay so off-screen images (e.g. event flyer) have time to load
            await new Promise((r) => setTimeout(r, 300));

            const safeCutPoints = getSafeCutPoints(element);
            const safeCutPointsScaled = safeCutPoints.map((y) => y * HTML2CANVAS_SCALE);

            const canvas = await html2canvas(element, {
                scale: HTML2CANVAS_SCALE,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                imageTimeout: 10000
            });

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            const scale = pageWidth / imgWidth;
            const scaledWidth = imgWidth * scale;
            const scaledHeight = imgHeight * scale;
            const pageHeightPx = pageHeight / scale;

            if (scaledHeight <= pageHeight) {
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, PDF_PAGE_TOP_PADDING_MM, scaledWidth, scaledHeight);
            } else {
                let yOffset = 0;
                let pageNum = 0;
                while (yOffset < imgHeight) {
                    if (pageNum > 0) pdf.addPage();
                    const maxY = Math.min(yOffset + pageHeightPx, imgHeight);
                    let sliceEnd = findSliceEnd(safeCutPointsScaled, yOffset, maxY);
                    if (sliceEnd <= yOffset) {
                        sliceEnd = maxY;
                    }
                    const sliceHeight = sliceEnd - yOffset;

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = imgWidth;
                    tempCanvas.height = sliceHeight;
                    const ctx = tempCanvas.getContext('2d');
                    ctx.drawImage(canvas, 0, yOffset, imgWidth, sliceHeight, 0, 0, imgWidth, sliceHeight);
                    const destHeight = sliceHeight * scale;
                    pdf.addImage(tempCanvas.toDataURL('image/png'), 'PNG', 0, PDF_PAGE_TOP_PADDING_MM, scaledWidth, destHeight);
                    yOffset += sliceHeight;
                    pageNum++;
                }
            }

            const filename = `post-mortem-${(event.name || 'event').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
            pdf.save(filename);

            addNotification?.({
                title: 'PDF exported',
                message: `Saved as ${filename}`,
                type: 'success'
            });
        } catch (err) {
            addNotification?.({
                title: 'Export failed',
                message: err.message || 'Failed to export PDF',
                type: 'error'
            });
            throw err;
        }
    }, []);

    return { exportToPdf };
}
