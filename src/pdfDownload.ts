/**
 * Certificate PDF delivery for mobile + desktop.
 *
 * iOS Safari and many Android WebViews block or mishandle programmatic downloads and
 * sometimes block top-level navigation to blob: URLs. Strategy:
 * 1) Web Share API with a File (opens system sheet → Save to Files / Drive / etc.)
 * 2) Reuse the user-gesture placeholder tab as a mini viewer (iframe/object + tap link)
 * 3) <a download> / new tab / same-window assign as fallbacks
 */

export function shouldUseMobilePdfDelivery(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function ensurePdfBlob(blob: Blob): Blob {
  if (blob.type && blob.type.toLowerCase().includes('pdf')) return blob;
  return new Blob([blob], { type: 'application/pdf' });
}

/** Call synchronously in the click handler before any await. */
export function openPdfLoadingPlaceholder(): Window | null {
  // `about:blank` + no feature string maximizes odds the opener can inject the viewer later.
  const w = window.open('about:blank', '_blank');
  if (!w) return null;
  try {
    const d = w.document;
    d.open();
    d.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Certificate</title></head><body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#475569;display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:16px;text-align:center"><p style="margin:0;font-size:15px">Preparing your certificate…</p></body></html>',
    );
    d.close();
  } catch {
    /* ignore */
  }
  return w;
}

function closeQuietly(tab: Window | null) {
  try {
    if (tab && !tab.closed) tab.close();
  } catch {
    /* ignore */
  }
}

/** Returns true if the viewer HTML was injected; only then schedules blob URL revoke. */
function injectPdfViewerPage(tab: Window, blobUrl: string, filename: string, revokeAfterMs: number): boolean {
  const safeName = escapeHtml(filename);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeName}</title>
<style>
  html,body{margin:0;padding:0;min-height:100dvh;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif}
  .bar{padding:14px 16px;background:#1e3a8a;font-weight:700;font-size:15px;text-align:center}
  .frame-wrap{flex:1;display:flex;flex-direction:column;min-height:55dvh;background:#fff}
  iframe,object{width:100%;border:0;flex:1;min-height:55dvh;background:#fff}
  .hint{padding:14px 18px;font-size:14px;line-height:1.45;color:#cbd5e1;background:#0f172a}
  .actions{padding:16px;text-align:center;background:#0f172a}
  a.btn{display:inline-block;padding:14px 22px;background:#2563eb;color:#fff;text-decoration:none;border-radius:14px;font-weight:700;font-size:15px}
  a.btn:active{opacity:0.9}
</style>
</head>
<body>
<div class="bar">Your certificate is ready</div>
<div class="frame-wrap">
<object data="${blobUrl}" type="application/pdf"><iframe src="${blobUrl}" title="Certificate PDF"></iframe></object>
</div>
<p class="hint"><strong>iPhone / iPad:</strong> If the preview is blank, tap the blue button below. Then use <strong>Share</strong> (square-arrow) in the viewer and choose <strong>Save to Files</strong>.<br/><br/><strong>Android:</strong> Tap the button, then use the menu (⋮) to download or share.</p>
<div class="actions"><a class="btn" href="${blobUrl}" download="${escapeHtml(filename)}" target="_blank" rel="noopener">Open / save PDF</a></div>
</body>
</html>`;
  try {
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), revokeAfterMs);
    return true;
  } catch {
    return false;
  }
}

export type PdfDeliveryMethod = 'share' | 'viewer_tab' | 'blob_navigate' | 'anchor' | 'popup' | 'same_window';

export type PdfDeliveryResult = { ok: true; method: PdfDeliveryMethod } | { ok: false; reason: string };

/**
 * Delivers a PDF to the user. Prefer awaiting this after building the blob.
 * Closes the placeholder tab when native share succeeds so the user is not left on "Preparing…".
 */
export async function deliverPdfBlob(blob: Blob, filename: string, loadingTab: Window | null): Promise<PdfDeliveryResult> {
  const pdfBlob = ensurePdfBlob(blob);
  const file = new File([pdfBlob], filename, { type: 'application/pdf' });

  // ── 1) Web Share API (best on iOS 14+ and many Android browsers) ─────────
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      const data: ShareData = {
        files: [file],
        title: 'Certificate',
        text: 'iSCENE 2026 certificate',
      };
      if (navigator.canShare(data)) {
        await navigator.share(data);
        closeQuietly(loadingTab);
        return { ok: true, method: 'share' };
      }
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'AbortError') {
        closeQuietly(loadingTab);
        return { ok: true, method: 'share' };
      }
      // NotAllowedError after async tap — fall through to viewer
    }
  }

  const url = URL.createObjectURL(pdfBlob);
  const revokeLater = (ms: number) => window.setTimeout(() => URL.revokeObjectURL(url), ms);

  // ── 2) Placeholder tab: full viewer page (works when blob: navigation alone fails) ──
  if (loadingTab && !loadingTab.closed) {
    if (injectPdfViewerPage(loadingTab, url, filename, 120_000)) {
      return { ok: true, method: 'viewer_tab' };
    }
    try {
      loadingTab.location.replace(url);
      revokeLater(120_000);
      return { ok: true, method: 'blob_navigate' };
    } catch {
      /* fall through */
    }
  }

  // ── 3) Fresh popup with same viewer (no prior tab) ───────────────────────
  if (shouldUseMobilePdfDelivery()) {
    const pop = window.open('about:blank', '_blank');
    if (pop) {
      if (injectPdfViewerPage(pop, url, filename, 120_000)) {
        return { ok: true, method: 'popup' };
      }
      closeQuietly(pop);
    }
  }

  // ── 4) Programmatic download link ─────────────────────────────────────────
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    if (shouldUseMobilePdfDelivery()) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    revokeLater(120_000);
    return { ok: true, method: 'anchor' };
  } catch {
    /* fall through */
  }

  // ── 5) Same window (exits SPA; user gets the PDF) ──────────────────────────
  try {
    window.location.assign(url);
    return { ok: true, method: 'same_window' };
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, reason: 'This browser blocked opening the PDF. Try Safari or Chrome, or use a desktop browser.' };
  }
}
