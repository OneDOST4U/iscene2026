/**
 * Mobile Safari / Chrome often block window.open() if it runs after await (not a "user gesture").
 * jsPDF's .save() also fails on many mobile browsers. Pattern: open a blank tab synchronously on
 * click, then navigate that tab to a blob: PDF URL after async generation.
 */

export function shouldUseMobilePdfDelivery(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

/** Call synchronously in the click handler before any await. Returns null if pop-ups are blocked. */
export function openPdfLoadingPlaceholder(): Window | null {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return null;
  try {
    const doc = w.document;
    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Certificate</title></head><body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#475569;display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:16px;text-align:center"><p style="margin:0;font-size:15px">Preparing your certificate…</p></body></html>',
    );
    doc.close();
  } catch {
    /* cross-origin or blocked */
  }
  return w;
}

export function deliverPdfBlob(blob: Blob, filename: string, loadingTab: Window | null): void {
  const pdfBlob =
    blob.type && blob.type.toLowerCase().includes('pdf')
      ? blob
      : new Blob([blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(pdfBlob);
  const revokeLater = () => {
    window.setTimeout(() => URL.revokeObjectURL(url), 90_000);
  };

  if (loadingTab && !loadingTab.closed) {
    try {
      loadingTab.location.replace(url);
      revokeLater();
      return;
    } catch {
      /* fall through */
    }
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  // Mobile often ignores `download` for PDFs; new tab shows the viewer + Share → Save.
  if (shouldUseMobilePdfDelivery()) {
    a.target = '_blank';
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  revokeLater();
}
