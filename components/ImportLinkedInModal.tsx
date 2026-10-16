/**
 * components/ImportLinkedInModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Import from LinkedIn — two steps:
 *
 * STEP 1 — "input"   Pick one of three ways to bring in LinkedIn data
 *   • Paste text   — copy/paste straight from a LinkedIn profile
 *   • Upload PDF   — LinkedIn's instant "Save to PDF" export
 *   • Upload ZIP   — LinkedIn's full "Get a copy of your data" export
 *   All three are turned into plain text client-side (lib/profileImport.ts)
 *   then handed to onExtract, which calls the AI extraction endpoint.
 *
 * STEP 2 — "review"  Handed off to the shared ProfileImportReview, the same
 *   screen Import from Resume uses once it has an extraction result.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { User } from '../types';
import { extractPdfText, extractZipText, ProfileExtraction } from '../lib/profileImport';
import ProfileImportReview from './profile/ProfileImportReview';

const GREEN    = 'var(--bw-green)';
const GREEN_LT = 'var(--bw-green-light)';

interface Props {
  user: User;
  onExtract:      (rawText: string) => Promise<ProfileExtraction>;
  onSaveProfile:  (updates: Record<string, any>) => Promise<void>;
  onClose:        () => void;
}

type InputTab = 'paste' | 'pdf' | 'zip';

const ImportLinkedInModal: React.FC<Props> = ({ user, onExtract, onSaveProfile, onClose }) => {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [tab, setTab] = useState<InputTab>('paste');
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState<ProfileExtraction | null>(null);

  function selectTab(next: InputTab) {
    setTab(next);
    setFile(null);
    setError('');
  }

  async function handleExtract() {
    setError('');
    setExtracting(true);
    try {
      let rawText = '';
      if (tab === 'paste') {
        rawText = pastedText.trim();
        if (!rawText) throw new Error('Paste some profile text first.');
      } else if (tab === 'pdf') {
        if (!file) throw new Error('Choose a PDF file first.');
        rawText = await extractPdfText(file);
      } else {
        if (!file) throw new Error('Choose a ZIP file first.');
        rawText = await extractZipText(file);
      }

      const result = await onExtract(rawText);
      setExtraction(result);
      setStep('review');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: GREEN_LT }}>
                <svg className="w-5 h-5" style={{ color: GREEN }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900">Import from LinkedIn</h2>
                <p className="text-xs text-stone-600">
                  {step === 'input' ? 'Bring in your experience and skills from your own LinkedIn data' : 'Review before anything is saved'}
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-stone-600 hover:text-stone-600 mt-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {step === 'input' && (
            <div className="flex border-b" style={{ borderColor: '#e7e5e4' }}>
              {([
                { id: 'paste', label: 'Paste text' },
                { id: 'pdf',   label: 'Upload PDF' },
                { id: 'zip',   label: 'Upload ZIP' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => selectTab(t.id)}
                  className="px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    color: tab === t.id ? GREEN : '#78716c',
                    borderBottom: tab === t.id ? `2px solid ${GREEN}` : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {step === 'input' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                {tab === 'paste' && (
                  <div>
                    <textarea
                      value={pastedText}
                      onChange={e => setPastedText(e.target.value)}
                      placeholder="Copy your About and Experience sections from your LinkedIn profile and paste them here…"
                      rows={10}
                      className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2"
                      style={{ borderColor: '#e7e5e4' }}
                    />
                  </div>
                )}

                {tab === 'pdf' && (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-600 leading-relaxed">
                      On your own LinkedIn profile, click the <strong>More</strong> button near your photo, then <strong>Save to PDF</strong>. It downloads instantly — no waiting.
                    </p>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={e => setFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm"
                    />
                    {file && <p className="text-xs text-stone-600">Selected: {file.name}</p>}
                  </div>
                )}

                {tab === 'zip' && (
                  <div className="space-y-3">
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Go to LinkedIn <strong>Settings &amp; Privacy → Data privacy → Get a copy of your data</strong>, request the <strong>basic</strong> export, and upload the ZIP LinkedIn emails you. This usually takes LinkedIn 24–72 hours to prepare.
                    </p>
                    <input
                      type="file"
                      accept="application/zip,.zip"
                      onChange={e => setFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm"
                    />
                    {file && <p className="text-xs text-stone-600">Selected: {file.name}</p>}
                  </div>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: '#e7e5e4' }}>
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#e7e5e4', color: '#374151' }}>
                Cancel
              </button>
              <button onClick={handleExtract} disabled={extracting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: GREEN }}>
                {extracting && <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>}
                {extracting ? 'Reading…' : 'Extract'}
              </button>
            </div>
          </>
        )}

        {step === 'review' && extraction && (
          <ProfileImportReview
            user={user}
            extraction={extraction}
            onSaveProfile={onSaveProfile}
            onBack={() => { setStep('input'); setExtraction(null); }}
            onDone={onClose}
            sourceLabel="LinkedIn data"
          />
        )}
      </div>
    </div>
  );
};

export default ImportLinkedInModal;
