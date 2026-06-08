/**
 * lib/videoUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-only utility for extracting a still frame from a video File.
 * Uses the HTML5 Canvas API — no server round-trip needed for the extraction.
 * The resulting base64 JPEG is what we send to /api/verify-reel.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Extract a single JPEG frame from a video File at the given seek time.
 * Returns base64-encoded JPEG data (without the data: URI prefix).
 *
 * @param file       The video File object from the file picker or recorder
 * @param seekSecs   Which second to capture (default: 1.0 — gives the face a moment to appear)
 * @param quality    JPEG quality 0–1 (default: 0.85 — good quality, reasonable size)
 */
export function extractVideoFrame(
  file: File,
  seekSecs = 1.0,
  quality = 0.85
): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  return new Promise((resolve, reject) => {
    const video  = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const url    = URL.createObjectURL(file);

    video.preload  = 'metadata';
    video.muted    = true;
    video.playsInline = true;
    video.src      = url;

    video.addEventListener('loadedmetadata', () => {
      // Cap seek to video length; fall back to 0 if video is very short
      video.currentTime = Math.min(seekSecs, Math.max(0, video.duration - 0.1));
    });

    video.addEventListener('seeked', () => {
      try {
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 360;
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl  = canvas.toDataURL('image/jpeg', quality);
        // Strip the "data:image/jpeg;base64," prefix — API just wants the raw base64
        const base64   = dataUrl.split(',')[1];

        URL.revokeObjectURL(url);
        video.src = '';

        if (!base64) { reject(new Error('Canvas produced empty frame')); return; }
        resolve({ base64, mediaType: 'image/jpeg' });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    });

    video.addEventListener('error', (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Video load error: ${video.error?.message ?? 'unknown'}`));
    });
  });
}

/**
 * Call /api/verify-reel with the extracted frame.
 * Returns the server's verdict, or null if the call fails (never blocks the upload).
 */
export async function submitForVerification(params: {
  reelId:    string;
  authorUid: string;
  file:      File;
  type:      'microIntro' | 'reel';
}): Promise<{ verdict: string; confidence: string; status: string } | null> {
  try {
    const { base64, mediaType } = await extractVideoFrame(params.file);
    const res = await fetch('/api/verify-reel', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reelId:          params.reelId,
        authorUid:       params.authorUid,
        frameBase64:     base64,
        frameMediaType:  mediaType,
        context: { type: params.type },
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[submitForVerification] failed (non-blocking):', err);
    return null;
  }
}
