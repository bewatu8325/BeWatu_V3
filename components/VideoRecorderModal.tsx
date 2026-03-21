import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { LoadingIcon, CameraIcon } from '../constants';

interface VideoRecorderModalProps {
  onSave: (videoUrl: string) => void;
  onClose: () => void;
  fbUid: string;
}

const MAX_DURATION = 30;
const GREEN = '#1a4a3a';

// ─── Upload to Firebase Storage ───────────────────────────────────────────────
async function uploadVideoToStorage(
  blob: Blob,
  fbUid: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
  const path = `vibe-clips/${fbUid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, { contentType: blob.type });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconUpload = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconVideo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 10 4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.91L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
);
const IconX = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const IconCheck = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const IconRefresh = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
);

// ─── Upload progress bar ──────────────────────────────────────────────────────
const UploadProgress: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between text-xs text-stone-500">
      <span>Uploading…</span>
      <span>{pct}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: GREEN }}
      />
    </div>
  </div>
);

// ─── Record tab ───────────────────────────────────────────────────────────────
const RecordTab: React.FC<{ fbUid: string; onSave: (url: string) => void }> = ({ fbUid, onSave }) => {
  const [permission, setPermission] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded' | 'uploading'>('idle');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(MAX_DURATION);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startStream = useCallback(async (facing: 'user' | 'environment') => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: true,
    });
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    recorderRef.current = new MediaRecorder(stream);
    recorderRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setStatus('recorded');
      chunksRef.current = [];
    };
  }, []);

  const getPermissions = useCallback(async () => {
    setPermission('pending');
    try {
      await startStream('user');
      setPermission('granted');
    } catch {
      setPermission('denied');
    }
  }, [startStream]);

  const flipCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    try { await startStream(next); } catch { setFacingMode(facingMode); }
  }, [facingMode, startStream]);

  const startRecording = () => {
    if (recorderRef.current?.state === 'inactive') {
      setStatus('recording');
      recorderRef.current.start();
      setCountdown(MAX_DURATION);
      timerRef.current = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { stopRecording(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  const handleRetake = () => {
    setRecordedBlob(null);
    setRecordedUrl(null);
    setStatus('idle');
    setCountdown(MAX_DURATION);
    setError(null);
  };

  const handleSave = async () => {
    if (!recordedBlob) return;
    setStatus('uploading');
    setError(null);
    try {
      const url = await uploadVideoToStorage(recordedBlob, fbUid, setUploadPct);
      onSave(url);
    } catch (err: any) {
      setError('Upload failed. Please try again.');
      setStatus('recorded');
    }
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const progress = ((MAX_DURATION - countdown) / MAX_DURATION) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-100">
        {permission === 'denied' && (
          <div className="flex h-full items-center justify-center text-sm text-red-500 px-6 text-center">
            Camera access denied. Enable it in your browser settings and reload.
          </div>
        )}
        {permission === 'pending' && (
          <div className="flex h-full items-center justify-center">
            <LoadingIcon className="w-8 h-8 animate-spin text-stone-400" />
          </div>
        )}
        {permission === 'idle' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
            <svg className="w-12 h-12 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="m15 10 4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.91L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            <p className="text-sm">Camera preview will appear here</p>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          muted={status !== 'recorded'}
          playsInline
          controls={status === 'recorded'}
          className={`w-full h-full object-cover ${permission === 'idle' || permission === 'denied' ? 'hidden' : ''}`}
          src={recordedUrl || undefined}
        />
        {status === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            REC &nbsp;00:{countdown.toString().padStart(2, '0')}
          </div>
        )}
        {permission === 'granted' && status !== 'recorded' && status !== 'uploading' && (
          <button
            onClick={flipCamera}
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7h-3a2 2 0 0 1-2-2V2"/>
              <path d="M9 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9l-5-5"/>
              <path d="M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/>
            </svg>
          </button>
        )}
      </div>

      {status === 'recording' && (
        <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden">
          <div className="h-full rounded-full bg-red-400 transition-all duration-1000" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status === 'uploading' && <UploadProgress pct={uploadPct} />}

      {error && (
        <div className="text-sm text-red-500 text-center">{error}</div>
      )}

      <div className="flex items-center justify-center gap-3 pt-1">
        {permission === 'idle' && (
          <button onClick={getPermissions}
            className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            <CameraIcon className="w-4 h-4" /> Enable Camera
          </button>
        )}
        {permission === 'granted' && status === 'idle' && (
          <button onClick={startRecording}
            className="flex h-14 w-14 items-center justify-center rounded-full border-4 bg-red-500 hover:bg-red-400 transition-colors"
            style={{ borderColor: '#fca5a5' }} />
        )}
        {permission === 'granted' && status === 'recording' && (
          <button onClick={stopRecording}
            className="flex h-14 w-14 items-center justify-center rounded-lg border-4 bg-red-500 hover:bg-red-400 transition-colors"
            style={{ borderColor: '#fca5a5' }} />
        )}
        {status === 'recorded' && (
          <>
            <button onClick={handleRetake}
              className="flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
              style={{ borderColor: '#e7e5e4' }}>
              <IconRefresh /> Retake
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: GREEN }}>
              <IconCheck /> Save Vibe Clip
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Upload tab ───────────────────────────────────────────────────────────────
const UploadTab: React.FC<{ fbUid: string; onSave: (url: string) => void }> = ({ fbUid, onSave }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setError(null);
    if (!f.type.startsWith('video/')) {
      setError('Please select a video file (MP4, MOV, WebM, etc.)');
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('File is too large. Maximum size is 100 MB.');
      return;
    }
    const url = URL.createObjectURL(f);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (video.duration > MAX_DURATION + 1) {
        setError(`Video is ${Math.round(video.duration)}s — max is ${MAX_DURATION}s. Please trim it first.`);
        URL.revokeObjectURL(url);
      } else {
        setPreviewUrl(url);
        setFile(f);
      }
    };
    video.src = url;
  };

  const handleSave = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadVideoToStorage(file, fbUid, setUploadPct);
      onSave(url);
    } catch {
      setError('Upload failed. Please try again.');
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <div className="flex flex-col gap-4">
      {!previewUrl ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 transition-colors ${
            dragging ? 'border-[#1a4a3a] bg-[#e8f4f0]' : 'border-stone-300 hover:border-stone-400 bg-stone-50'
          }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border" style={{ borderColor: '#e7e5e4' }}>
            <IconUpload />
          </div>
          <div className="text-center">
            <p className="font-semibold text-stone-800">Drop your video here</p>
            <p className="mt-1 text-sm text-stone-500">or <span className="font-semibold" style={{ color: GREEN }}>browse files</span></p>
            <p className="mt-2 text-xs text-stone-400">MP4, MOV, WebM · max 30 seconds · max 100 MB</p>
          </div>
          <input ref={inputRef} type="file" accept="video/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      ) : (
        <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-100">
          <video src={previewUrl} controls className="w-full h-full object-cover" />
        </div>
      )}

      {uploading && <UploadProgress pct={uploadPct} />}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {previewUrl && !uploading && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => { setPreviewUrl(null); setFile(null); setError(null); }}
            className="flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
            style={{ borderColor: '#e7e5e4' }}>
            <IconRefresh /> Choose different
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: GREEN }}>
            <IconCheck /> Save Vibe Clip
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Modal shell ──────────────────────────────────────────────────────────────
const VideoRecorderModal: React.FC<VideoRecorderModalProps> = ({ onSave, onClose, fbUid }) => {
  const [tab, setTab] = useState<'record' | 'upload'>('record');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border overflow-hidden"
        style={{ borderColor: '#e7e5e4' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#e7e5e4' }}>
          <div>
            <h2 className="font-bold text-lg text-stone-900">Add Vibe Clip</h2>
            <p className="text-xs text-stone-500 mt-0.5">30 seconds max · show your vibe</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors">
            <IconX />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-4">
          {([
            { id: 'record', label: 'Record', icon: <IconVideo /> },
            { id: 'upload', label: 'Upload', icon: <IconUpload /> },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id ? 'text-white' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
              }`}
              style={tab === t.id ? { backgroundColor: GREEN } : {}}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 pt-4">
          {tab === 'record'
            ? <RecordTab fbUid={fbUid} onSave={onSave} />
            : <UploadTab fbUid={fbUid} onSave={onSave} />
          }
        </div>
      </div>
    </div>
  );
};

export default VideoRecorderModal;
