/**
 * lib/compressVideo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compresses a video file client-side before upload using the browser's
 * Canvas + MediaRecorder APIs. Re-encodes to fit within the reel box
 * (max 720p, capped bitrate) without requiring any server or third-party lib.
 *
 * Usage:
 *   const compressed = await compressVideo(file, { maxWidth: 720, maxHeight: 1280 });
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CompressOptions {
  maxWidth?:   number;  // default 720
  maxHeight?:  number;  // default 1280
  videoBitrate?: number; // bps, default 1_500_000 (1.5Mbps)
  audioBitrate?: number; // bps, default 128_000
  mimeType?:   string;  // default 'video/webm;codecs=vp9,opus'
}

/**
 * Returns a compressed Blob. Falls back to the original file if the
 * browser doesn't support the required APIs.
 */
export async function compressVideo(
  file:    File,
  opts:    CompressOptions = {},
): Promise<Blob> {
  const {
    maxWidth    = 720,
    maxHeight   = 1280,
    videoBitrate = 1_500_000,
    audioBitrate = 128_000,
  } = opts;

  // Determine best supported mime type
  const mimeType = opts.mimeType ?? getBestMimeType();

  // If browser can't re-encode, return original
  if (!mimeType || !window.MediaRecorder || !('captureStream' in HTMLVideoElement.prototype)) {
    console.warn('compressVideo: browser does not support MediaRecorder capture, using original');
    return file;
  }

  return new Promise((resolve, reject) => {
    const video   = document.createElement('video');
    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d')!;
    const chunks: BlobPart[] = [];

    video.src      = URL.createObjectURL(file);
    video.muted    = false;
    video.playsInline = true;
    video.preload  = 'auto';

    video.onloadedmetadata = () => {
      // Calculate output dimensions maintaining aspect ratio
      const { width: vw, height: vh } = video;
      const ratio  = Math.min(maxWidth / vw, maxHeight / vh, 1); // never upscale
      canvas.width  = Math.round(vw * ratio);
      canvas.height = Math.round(vh * ratio);

      // Start recording the canvas stream
      const fps          = 30;
      const canvasStream = canvas.captureStream(fps);

      // Try to capture audio from the video element too
      let recorder: MediaRecorder;
      try {
        // @ts-ignore — captureStream is non-standard
        const videoStream: MediaStream = video.captureStream(fps);
        const audioTracks = videoStream.getAudioTracks();
        audioTracks.forEach(t => canvasStream.addTrack(t));
        recorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: videoBitrate,
          audioBitsPerSecond: audioBitrate,
        });
      } catch {
        recorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: videoBitrate,
        });
      }

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        URL.revokeObjectURL(video.src);
        const blob = new Blob(chunks, { type: mimeType });
        // If compression made it bigger (rare), return original
        resolve(blob.size < file.size ? blob : file);
      };
      recorder.onerror = () => { URL.revokeObjectURL(video.src); resolve(file); };

      // Draw video frames to canvas
      let animFrame: number;
      const drawFrame = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        animFrame = requestAnimationFrame(drawFrame);
      };

      recorder.start(100); // collect data every 100ms
      video.play().then(() => {
        drawFrame();
      }).catch(() => resolve(file));

      video.onended = () => {
        cancelAnimationFrame(animFrame);
        recorder.stop();
      };
    };

    video.onerror = () => resolve(file); // fallback on error
  });
}

function getBestMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}
