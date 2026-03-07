import React, { useRef, useState, useEffect } from 'react';

interface VideoPlayerModalProps {
  videoUrl: string;
  onClose: () => void;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ videoUrl, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  // Attempt autoplay on mount
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false; // modal = intentional user action, so unmuted is fine
    const p = v.play();
    if (p !== undefined) p.catch(() => { /* browser will show controls, user can tap play */ });
  }, [videoUrl]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const code = v.error?.code ?? -1;
    const msg  = v.error?.message ?? 'Unknown error';
    console.error('[VideoPlayerModal] Video load error:', { code, msg, src: videoUrl });
    setErrorCode(code);
    setErrorMsg(msg);
  };

  // MediaError codes: 1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED
  // CORS shows as code 2 (NETWORK) or 4 (SRC_NOT_SUPPORTED) with empty message
  const isCors = errorCode === 2 || (errorCode === 4 && (!errorMsg || errorMsg === ''));
  const hasError = errorCode !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#1c1917' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-14 px-8 text-center">
            <svg className="w-10 h-10 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            {isCors ? (
              <>
                <p className="text-sm font-bold text-stone-300">Storage access blocked</p>
                <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                  Firebase Storage is blocking playback from this domain. Add <code className="text-stone-300">bewatu.com</code> to your Storage CORS config in Firebase Console.
                </p>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-xs font-bold underline text-stone-400 hover:text-white"
                >
                  Try opening directly →
                </a>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-stone-300">Video unavailable</p>
                <p className="text-xs text-stone-500">
                  This clip could not be loaded.{errorCode > 0 ? ` (error ${errorCode})` : ''}
                </p>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-xs font-bold underline text-stone-400 hover:text-white"
                >
                  Try opening directly →
                </a>
              </>
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            className="w-full max-h-[80vh] object-contain"
            controls
            playsInline
            preload="metadata"
            onError={handleError}
          />
        )}
      </div>
    </div>
  );
};

export default VideoPlayerModal;
