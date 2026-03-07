import React, { useState, useEffect } from 'react';
import { Job, Company } from '../types';
import { generateJobDescription } from '../services/geminiService';
import { LoadingIcon, SparklesIcon } from '../constants';
import { useTranslation } from '../hooks/useTranslation';
import { useFirebase } from '../contexts/FirebaseContext';
import { getChallenges } from '../lib/firestoreService';

interface JobEditorModalProps {
    job: Job | null;
    companies: Company[];
    recruiterId: number;
    onClose: () => void;
    onSave: (jobData: Partial<Job> | Omit<Job, 'id'>) => void;
}

const toInputDate = (isoDate: string) => isoDate.split('T')[0];
const fromInputDate = (inputDate: string) => new Date(inputDate).toISOString();

const JobEditorModal: React.FC<JobEditorModalProps> = ({ job, companies, recruiterId, onClose, onSave }) => {
    const { t } = useTranslation();
    const { fbUser } = useFirebase();
    const [formData, setFormData] = useState({
        title: job?.title || '',
        companyId: job?.companyId || companies[0]?.id || 0,
        location: job?.location || '',
        type: job?.type || 'Full-time',
        experienceLevel: job?.experienceLevel || 'Mid-level',
        description: job?.description || '',
        status: job?.status || 'Active',
        liveDate: job ? toInputDate(job.liveDate) : toInputDate(new Date().toISOString()),
        expiryDate: job ? toInputDate(job.expiryDate) : toInputDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
    });
    const [aiKeywords, setAiKeywords] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Prove challenge attachment
    const [challenges, setChallenges] = useState<any[]>([]);
    const [linkedChallengeId, setLinkedChallengeId] = useState<string>((job as any)?.linkedChallengeId ?? '');
    const [requireChallenge, setRequireChallenge] = useState<boolean>((job as any)?.requireChallenge ?? false);
    const [loadingChallenges, setLoadingChallenges] = useState(false);

    useEffect(() => {
        if (job) {
            setFormData({
                title: job.title,
                companyId: job.companyId,
                location: job.location,
                type: job.type,
                experienceLevel: job.experienceLevel,
                description: job.description,
                status: job.status,
                liveDate: toInputDate(job.liveDate),
                expiryDate: toInputDate(job.expiryDate),
            });
        }
    }, [job]);

    // Load recruiter's challenges
    useEffect(() => {
        if (!fbUser) return;
        setLoadingChallenges(true);
        getChallenges(50)
            .then((data: any[]) => {
                // Filter to only challenges created by this recruiter
                setChallenges(data.filter((c: any) => c.recruiterId === fbUser.uid || !c.recruiterId));
            })
            .catch(console.error)
            .finally(() => setLoadingChallenges(false));
    }, [fbUser]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'companyId' ? parseInt(value) : value }));
    };

    const handleGenerateDescription = async () => {
        if (!formData.title || !aiKeywords) return;
        setIsGenerating(true);
        try {
            const description = await generateJobDescription(formData.title, aiKeywords);
            setFormData(prev => ({ ...prev, description }));
        } catch (error) {
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...formData,
            liveDate: fromInputDate(formData.liveDate),
            expiryDate: fromInputDate(formData.expiryDate),
            recruiterId,
            // Prove challenge fields (stored on Firestore doc, typed via `as any` since Job interface doesn't have them yet)
            ...(linkedChallengeId ? { linkedChallengeId, requireChallenge } : { linkedChallengeId: null, requireChallenge: false }),
        } as any);
        onClose();
    };

    const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";
    const linkedChallenge = challenges.find(c => c.id === linkedChallengeId);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="p-5 border-b border-slate-700">
                        <h2 className="text-xl font-bold text-slate-100">{job ? t('editJobPosting') : t('createJobPosting')}</h2>
                    </div>
                    <div className="p-6 overflow-y-auto space-y-4 flex-grow">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('jobTitle')}</label>
                                <input type="text" name="title" value={formData.title} onChange={handleChange} className={inputStyles} required />
                            </div>
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('company')}</label>
                                <select name="companyId" value={formData.companyId} onChange={handleChange} className={inputStyles} required>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('location')}</label>
                                <input type="text" name="location" value={formData.location} onChange={handleChange} className={inputStyles} required />
                            </div>
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('jobType')}</label>
                                <select name="type" value={formData.type} onChange={handleChange} className={inputStyles}>
                                    <option>Full-time</option><option>Contract</option><option>Internship</option><option>Remote</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('experienceLevel')}</label>
                                <select name="experienceLevel" value={formData.experienceLevel} onChange={handleChange} className={inputStyles}>
                                    <option>Entry-level</option><option>Mid-level</option><option>Senior-level</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('goLiveDate')}</label>
                                <input type="date" name="liveDate" value={formData.liveDate} onChange={handleChange} className={inputStyles} required />
                            </div>
                            <div>
                                <label className="text-slate-300 font-semibold mb-1 block">{t('expiryDate')}</label>
                                <input type="date" name="expiryDate" value={formData.expiryDate} onChange={handleChange} className={inputStyles} required />
                            </div>
                        </div>
                        <div>
                            <label className="text-slate-300 font-semibold mb-1 block">{t('jobDescription')}</label>
                            <div className="flex items-center space-x-2 mb-2 p-2 bg-slate-700/50 border border-slate-600 rounded-md">
                                <SparklesIcon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={aiKeywords}
                                    onChange={(e) => setAiKeywords(e.target.value)}
                                    placeholder={t('aiDescriptionHelper')}
                                    className="w-full bg-transparent text-slate-300 text-sm focus:outline-none placeholder-slate-500"
                                />
                                <button type="button" onClick={handleGenerateDescription} disabled={isGenerating || !formData.title} className="bg-cyan-600 text-white font-semibold px-3 py-1 rounded-md text-xs hover:bg-cyan-500 transition-colors disabled:opacity-50 flex-shrink-0">
                                    {isGenerating ? <LoadingIcon className="w-4 h-4 animate-spin" /> : t('generate')}
                                </button>
                            </div>
                            <textarea name="description" value={formData.description} onChange={handleChange} className={`${inputStyles} min-h-[150px]`} required />
                        </div>

                        {/* ── Prove Challenge attachment ─────────────────────────────── */}
                        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                                    <span className="text-xs font-bold text-purple-400">P</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-purple-300">Prove Challenge (Optional)</p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Attach a challenge — applicants complete it before being considered. You'll see ranked results, not just CVs.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-400 mb-1 block">Select Challenge</label>
                                <select
                                    value={linkedChallengeId}
                                    onChange={e => setLinkedChallengeId(e.target.value)}
                                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                                >
                                    <option value="">No challenge attached</option>
                                    {loadingChallenges ? (
                                        <option disabled>Loading...</option>
                                    ) : challenges.length === 0 ? (
                                        <option disabled>No challenges found — create one in Prove first</option>
                                    ) : (
                                        challenges.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.title} ({c.type} · {c.difficulty})
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            {linkedChallengeId && (
                                <>
                                    {linkedChallenge && (
                                        <div className="rounded-lg bg-slate-800 border border-purple-500/20 px-3 py-2 text-xs text-slate-300">
                                            <span className="font-medium text-purple-300">{linkedChallenge.title}</span>
                                            {' · '}{linkedChallenge.difficulty} · {linkedChallenge.timeLimit} min · {linkedChallenge.submissionCount ?? 0} submissions
                                        </div>
                                    )}
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={requireChallenge}
                                            onChange={e => setRequireChallenge(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-600 bg-slate-700 accent-purple-500"
                                        />
                                        <span className="text-xs text-slate-300">
                                            Require challenge completion before application is reviewed
                                        </span>
                                    </label>
                                </>
                            )}
                        </div>
                        {/* ── End Prove Challenge ───────────────────────────────────── */}
                    </div>
                    <div className="p-4 border-t border-slate-700 flex justify-end space-x-2">
                        <button type="button" onClick={onClose} className="bg-slate-600 text-slate-200 font-semibold px-4 py-2 rounded-lg hover:bg-slate-500 transition-colors">{t('cancel')}</button>
                        <button type="submit" className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors">{t('saveJob')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default JobEditorModal;
