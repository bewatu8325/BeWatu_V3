/**
 * components/ImportResumeModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Import from Resume — unlike Import from LinkedIn, there is no input-method
 * picker here: the file is already sitting at the profile's resumeUrl (the
 * existing Resume Upload card in ProfilePage.tsx), re-fetched here by URL so
 * this works for a resume uploaded just now or in an earlier session, not
 * only immediately after upload. Extraction starts automatically on mount,
 * then hands off to the same ProfileImportReview screen Import from LinkedIn
 * uses once it has a result.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { extractPdfText, extractDocxText, ProfileExtraction } from '../lib/profileImport';
import ProfileImportReview from './profile/ProfileImportReview';

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

interface Props {
  user: User;
  resumeUrl: string;
  onExtract:     (rawText: string) => Promise<ProfileExtraction>;
  onSaveProfile: (updates: Record<string, any>) => Promise<void>;
  onClose:       () => void;
}

function extensionFromUrl(url: string): string {
  const withoutQuery = url.split('?')[0];
  let decoded = withoutQuery;
  try { decoded = decodeURIComponent(withoutQuery); } catch { /* leave as-is */ }
  return decoded.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? '';
}

const ImportResumeModal: React.FC<Props> = ({ user, resumeUrl, onExtract, onSaveProfile, onClose }) => {
  const [status, setStatus] = useState<'loading' | 'error' | 'review'>('loading');
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState<ProfileExtraction | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ext = extensionFromUrl(resumeUrl);
        if (ext === 'doc') {
          throw new Error('This is an older .doc file, which cannot be read here. Re-upload as PDF or .docx to use Extract.');
        }
        if (ext !== 'pdf' && ext !== 'docx') {
          throw new Error('Could not tell what type of file this is. Try re-uploading your resume.');
        }

        const res = await fetch(resumeUrl);
        if (!res.ok) throw new Error('Could not download your resume to read it.');
        const blob = await res.blob();

        const rawText = ext === 'pdf' ? await extractPdfText(blob) : await extractDocxText(blob);
        const result = await onExtract(rawText);
        if (cancelled) return;
        setExtraction(result);
        setStatus('review');
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message ?? 'Something went wrong reading your resume.');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [resumeUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: GREEN_LT }}>
                <svg className="w-5 h-5" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900">Import from Resume</h2>
                <p className="text-xs text-stone-600">
                  {status === 'review' ? 'Review before anything is saved' : 'Reading your uploaded resume'}
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-stone-600 hover:text-stone-600 mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {status === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 pb-10 text-center">
            <svg className="w-6 h-6 animate-spin" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
            <p className="text-sm text-stone-600">Reading your resume and pulling out your experience and skills…</p>
          </div>
        )}

        {status === 'error' && (
          <>
            <div className="flex-1 px-6 pb-6">
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end" style={{ borderColor: '#e7e5e4' }}>
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4', color: '#374151' }}>
                Close
              </button>
            </div>
          </>
        )}

        {status === 'review' && extraction && (
          <ProfileImportReview
            user={user}
            extraction={extraction}
            onSaveProfile={onSaveProfile}
            onDone={onClose}
          />
        )}
      </div>
    </div>
  );
};

export default ImportResumeModal;
