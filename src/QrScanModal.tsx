import React from 'react';
import QrScanner from 'qr-scanner';
import { ArrowLeft, Camera, CheckCircle2, ImageUp, QrCode, RefreshCw } from 'lucide-react';

export type QrScanModalProps = {
  title?: string;
  subtitle?: string;
  showTakePhoto?: boolean;
  onClose: () => void;
  onResult: (text: string) => void | Promise<void>;
  /** Optional footer with Reserve and Cancel when opened from room detail */
  footerActions?: React.ReactNode;
};

export function QrScanModal({
  title = 'iSCENE 2026 Scan',
  subtitle = 'Scanning will start automatically',
  showTakePhoto = true,
  onClose,
  onResult,
  footerActions,
}: QrScanModalProps) {
  const [camError, setCamError] = React.useState<string | null>(null);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const captureInputRef = React.useRef<HTMLInputElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerRef = React.useRef<QrScanner | null>(null);
  const closingRef = React.useRef(false);
  const handledRef = React.useRef(false);
  const historyTokenRef = React.useRef(`qr-scan-${Math.random().toString(36).slice(2)}`);
  const historyPushedRef = React.useRef(false);
  const successTimerRef = React.useRef<number | null>(null);
  const onCloseRef = React.useRef(onClose);
  const onResultRef = React.useRef(onResult);
  onCloseRef.current = onClose;
  onResultRef.current = onResult;

  const stopActiveScanner = React.useCallback(() => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        scanner.stop();
        scanner.destroy();
      } catch {}
    }
  }, []);

  const closeScanner = React.useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    stopActiveScanner();
    if (
      historyPushedRef.current &&
      (window.history.state as { scannerModal?: string } | null)?.scannerModal === historyTokenRef.current
    ) {
      historyPushedRef.current = false;
      window.history.back();
    }
    onCloseRef.current();
  }, [stopActiveScanner]);

  const playSuccessSound = React.useCallback(() => {
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, []);

  const handleScanSuccess = React.useCallback(
    (trimmed: string) => {
      if (handledRef.current || closingRef.current) return;
      handledRef.current = true;
      setScanResult(trimmed);
      playSuccessSound();

      successTimerRef.current = window.setTimeout(async () => {
        successTimerRef.current = null;
        try {
          await onResultRef.current(trimmed);
        } catch (err) {
          console.error('onResult error:', err);
        }
        await closeScanner();
      }, 1500);
    },
    [closeScanner, playSuccessSound],
  );

  const startScanner = React.useCallback(() => {
    stopActiveScanner();
    if (closingRef.current) return;

    setCamError(null);
    setCameraReady(false);

    const video = videoRef.current;
    if (!video) {
      setCamError('Scanner failed to initialize. Please try again.');
      return;
    }

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && window.innerWidth < 768);
    const preferredCamera: QrScanner.FacingMode = isMobile ? 'environment' : 'user';

    const scanner = new QrScanner(
      video,
      (result) => {
        const data = typeof result === 'string' ? result : result.data;
        const trimmed = (data || '').trim();
        if (!trimmed || handledRef.current || closingRef.current) return;
        stopActiveScanner();
        handleScanSuccess(trimmed);
      },
      {
        preferredCamera,
        maxScansPerSecond: 25,
        highlightScanRegion: false,
        highlightCodeOutline: false,
        onDecodeError: () => {},
        calculateScanRegion: (v) => {
          const w = v.videoWidth || 640;
          const h = v.videoHeight || 480;
          const size = Math.max(100, Math.min(w, h) * 0.75);
          const x = (w - size) / 2;
          const y = (h - size) / 2;
          return { x, y, width: size, height: size, downScaledWidth: 400, downScaledHeight: 400 };
        },
      },
    );
    scannerRef.current = scanner;
    scanner.setInversionMode('both'); // Detect dark-on-light and light-on-dark QR codes

    scanner
      .start()
      .then(() => {
        if (!closingRef.current && scannerRef.current === scanner) {
          setCameraReady(true);
          setCamError(null);
        }
      })
      .catch((err) => {
        if (scannerRef.current === scanner) {
          scannerRef.current = null;
          scanner.destroy();
          setCamError('Unable to start the camera. Please allow permission or try another device/browser.');
          console.error('QR scanner start error:', err);
        }
      });
  }, [handleScanSuccess, stopActiveScanner]);

  React.useEffect(() => {
    closingRef.current = false;
    handledRef.current = false;
    setScanResult(null);
    startScanner();

    const historyTimer = window.setTimeout(() => {
      try {
        window.history.pushState({ scannerModal: historyTokenRef.current }, '', window.location.href);
        historyPushedRef.current = true;
      } catch {}
    }, 0);

    const handlePopState = () => {
      historyPushedRef.current = false;
      closingRef.current = true;
      stopActiveScanner();
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.clearTimeout(historyTimer);
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      window.removeEventListener('popstate', handlePopState);
      stopActiveScanner();
    };
  }, [startScanner, stopActiveScanner]);

  const handleImageUpload = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || handledRef.current || closingRef.current) return;

      setUploadingImage(true);
      setCamError(null);
      setCameraReady(false);

      try {
        stopActiveScanner();
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        const decoded = result?.data ?? '';
        const trimmed = decoded.trim();
        if (!trimmed) {
          setCamError('No QR code was found in that image. Try another image or use the live camera.');
          startScanner();
          return;
        }

        handledRef.current = true;
        setScanResult(trimmed);
        playSuccessSound();

        successTimerRef.current = window.setTimeout(async () => {
          successTimerRef.current = null;
          try {
            await onResultRef.current(trimmed);
          } catch (err) {
            console.error('onResult error:', err);
          }
          await closeScanner();
        }, 1500);
      } catch {
        setCamError('No QR code was found in that image. Try another image or use the live camera.');
        startScanner();
      } finally {
        setUploadingImage(false);
        event.target.value = '';
      }
    },
    [closeScanner, playSuccessSound, startScanner, stopActiveScanner],
  );

  const controlsDisabled = uploadingImage;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950">
      <style>{`
        .qr-scan-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: translateZ(0);
          will-change: transform;
        }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      {showTakePhoto && (
        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="hidden"
        />
      )}

      {scanResult ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950">
          <div className="mx-6 w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl border border-emerald-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-200/50">
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>
            <p className="text-xl font-black text-slate-900">Scanned successfully</p>
            <p className="mt-2 text-sm text-slate-500">Closing camera…</p>
          </div>
          <button
            type="button"
            onClick={() => void closeScanner()}
            className="mt-6 flex items-center gap-2 px-5 py-3 rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30 font-semibold transition-colors"
          >
            <ArrowLeft size={18} />
            Close now
          </button>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 overflow-hidden bg-slate-900">
            <video ref={videoRef} className="qr-scan-video" playsInline muted />
          </div>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 to-transparent z-10" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent z-10" />

          <header className="absolute top-0 inset-x-0 z-30 flex items-center p-4">
            <button
              type="button"
              onClick={() => void closeScanner()}
              disabled={controlsDisabled}
              className="flex size-12 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md disabled:opacity-50 disabled:pointer-events-none"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="flex-1 text-center text-lg font-bold text-white drop-shadow-md">{title}</h2>
          </header>

          <main className="relative z-20 flex h-full flex-col items-center justify-center px-6 pb-28 pt-24">
            <div className="relative h-64 w-64 max-w-[78vw] max-h-[46vh] sm:h-80 sm:w-80">
              <div className="absolute inset-0 rounded-[28px] border border-white/15 shadow-[0_0_0_9999px_rgba(2,6,23,0.52)]" />
              <div className="absolute left-0 top-0 h-7 w-7 rounded-tl-2xl border-l-4 border-t-4 border-blue-500" />
              <div className="absolute right-0 top-0 h-7 w-7 rounded-tr-2xl border-r-4 border-t-4 border-blue-500" />
              <div className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-2xl border-b-4 border-l-4 border-blue-500" />
              <div className="absolute bottom-0 right-0 h-7 w-7 rounded-br-2xl border-b-4 border-r-4 border-blue-500" />
              <div className="absolute left-4 right-4 top-0 h-1 rounded-full bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_18px_rgba(43,140,238,0.95)] animate-pulse" />
              <div className="absolute inset-[18%] rounded-[22px] border-2 border-dashed border-white/35 bg-black/10 backdrop-blur-[1px] flex flex-col items-center justify-center text-center px-5">
                <img src="/iscene.png" alt="iSCENE" className="w-10 h-10 rounded-full object-contain bg-white/90 p-1 shadow-md mb-3" />
                <QrCode size={42} className="text-white/90 mb-3" />
                <p className="text-white text-sm font-bold">Place QR code here</p>
                <p className="text-slate-200 text-[11px] mt-1">Keep the code centered and steady</p>
              </div>
            </div>

            <div className="mt-20 w-full max-w-md text-center">
              <h3 className="text-white text-2xl font-bold">Align QR Code within frame</h3>
              <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
              {uploadingImage && <p className="mt-3 text-sm font-semibold text-blue-300">Reading uploaded image…</p>}
              {!uploadingImage && !camError && !cameraReady && (
                <p className="mt-3 text-sm font-semibold text-blue-300">Starting live camera…</p>
              )}
              {cameraReady && !camError && !uploadingImage && (
                <p className="mt-3 text-sm font-semibold text-emerald-300">Camera is ready. Point it at the QR code.</p>
              )}
              {camError && <p className="mt-3 text-sm font-semibold text-red-300">{camError}</p>}
            </div>
          </main>

          <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[28px] border-t border-white/10 bg-slate-50/95 px-6 py-5 backdrop-blur-xl">
            {footerActions && (
              <div className="flex gap-3 justify-center mb-4">
                {footerActions}
              </div>
            )}
            <div className="grid grid-cols-3 items-center justify-items-center gap-4 max-w-sm mx-auto">
              <div className={`flex items-center gap-3 justify-self-end ${showTakePhoto ? '' : 'col-span-1'}`}>
                <button
                  type="button"
                  onClick={() => !controlsDisabled && fileInputRef.current?.click()}
                  disabled={controlsDisabled}
                  title="Upload from Gallery"
                  className="flex flex-col items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="flex size-11 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600">
                    <ImageUp size={18} />
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">Gallery</span>
                </button>
                {showTakePhoto && (
                  <button
                    type="button"
                    onClick={() => !controlsDisabled && captureInputRef.current?.click()}
                    disabled={controlsDisabled}
                    title="Take Photo"
                    className="flex flex-col items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <span className="flex size-11 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600">
                      <Camera size={18} />
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">Take Photo</span>
                  </button>
                )}
              </div>
              <div className="flex size-20 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/30 ring-4 ring-blue-200/60">
                <QrCode size={30} />
              </div>
              <button
                type="button"
                onClick={() => startScanner()}
                disabled={controlsDisabled}
                title="Restart Camera"
                className="flex flex-col items-center gap-1 disabled:opacity-50 disabled:pointer-events-none justify-self-start"
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600">
                  <RefreshCw size={18} className={!cameraReady && !camError ? 'animate-spin' : ''} />
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Restart</span>
              </button>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-slate-500">
              Scan live · Upload from gallery{showTakePhoto ? ' · Take a photo' : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
