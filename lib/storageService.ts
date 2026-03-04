/**
 * lib/storageService.ts
 * Firebase Storage uploads for BeWatu.
 */
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

type ProgressFn = (pct: number) => void;

function upload(path: string, file: File, onProgress?: ProgressFn): Promise<string> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file, {
      contentType: file.type,
    });
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

function ext(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? 'bin';
}

/** Upload / replace avatar. Returns download URL. */
export async function uploadAvatar(uid: string, file: File, onProgress?: ProgressFn) {
  if (!file.type.startsWith('image/')) throw new Error('Must be an image file');
  if (file.size > 5 * 1024 * 1024) throw new Error('Avatar must be under 5 MB');
  return upload(`avatars/${uid}/profile.${ext(file)}`, file, onProgress);
}

/** Upload / replace cover photo. Returns download URL. */
export async function uploadCoverPhoto(uid: string, file: File, onProgress?: ProgressFn) {
  if (!file.type.startsWith('image/')) throw new Error('Must be an image file');
  if (file.size > 10 * 1024 * 1024) throw new Error('Cover photo must be under 10 MB');
  return upload(`covers/${uid}/cover.${ext(file)}`, file, onProgress);
}

/** Upload post media (image or video). Returns { url, type }. */
export async function uploadPostMedia(uid: string, file: File, onProgress?: ProgressFn) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new Error('Must be an image or video');
  if (isImage && file.size > 20 * 1024 * 1024) throw new Error('Image must be under 20 MB');
  if (isVideo && file.size > 200 * 1024 * 1024) throw new Error('Video must be under 200 MB');

  const url = await upload(`posts/${uid}/${Date.now()}.${ext(file)}`, file, onProgress);
  return { url, type: (isImage ? 'image' : 'video') as 'image' | 'video' };
}

/**
 * Upload the micro-introduction video (BeWatu feature).
 * Mirrors the videoUrl stored at User.microIntroductionUrl.
 */
export async function uploadMicroIntroduction(uid: string, blob: Blob, onProgress?: ProgressFn) {
  if (blob.size > 100 * 1024 * 1024) throw new Error('Video must be under 100 MB');
  return upload(`micro-introductions/${uid}/intro.webm`, blob, onProgress);
}

/** Upload a resume (PDF / Word). Returns download URL. */
export async function uploadResume(uid: string, file: File, onProgress?: ProgressFn) {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (!allowed.includes(file.type)) throw new Error('Must be PDF or Word doc');
  if (file.size > 10 * 1024 * 1024) throw new Error('Resume must be under 10 MB');
  return upload(`resumes/${uid}/resume.${ext(file)}`, file, onProgress);
}

/** Delete a file by its full storage URL. */
export async function deleteFile(url: string) {
  await deleteObject(ref(storage, url));
}
