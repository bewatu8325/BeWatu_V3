import React, { useState, useEffect } from 'react';
import { Job, Company } from '../../types';
import { generateJobDescription } from '../../services/geminiService';
import { LoadingIcon, SparklesIcon } from '../../constants';
import { useTranslation } from '../../hooks/useTranslation';

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
    const [formData, setFormData] = useState({
        title: job?.title || '',
        companyId: job?.companyId || companies[0]?.id || 0,
        location: job?.location || '',
        type: job?.type || 'Full-time',
        experienceLevel: job?.experienceLevel || 'Mid-level',
        description: job?.description || '',
        status: job?.status || 'Active',
        liveDate: job ? toInputDate(job.liveDate) : toInputDate(new Date().toISOString()),
        expiryDate: job ? toInputDate(job.expiryDate) : toInputDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()), // Default 30 days from now
    });
    const [aiKeywords, setAiKeywords] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

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
            recruiterId 
        });
        onClose();
    };

    const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";
    
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
                                    {isGenerating ? <LoadingIcon className="w-4 h-4 animate-spin"/> : t('generate')}
                                </button>
                            </div>
                            <textarea name="description" value={formData.description} onChange={handleChange} className={`${inputStyles} min-h-[150px]`} required />
                        </div>
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