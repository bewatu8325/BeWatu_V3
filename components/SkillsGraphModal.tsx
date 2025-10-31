import React, { useState } from 'react';
import { LoadingIcon, SparklesIcon } from '../constants';

interface SkillsGraphModalProps {
    onSubmit: (resume: string, digitalFootprint: string, references: string) => Promise<void>;
    onClose: () => void;
}

// FIX: Changed to a named export to resolve React.lazy import issue.
export const SkillsGraphModal: React.FC<SkillsGraphModalProps> = ({ onSubmit, onClose }) => {
    const [resume, setResume] = useState('');
    const [digitalFootprint, setDigitalFootprint] = useState('');
    const [references, setReferences] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!resume && !digitalFootprint && !references) {
            setError("Please provide at least one source of information.");
            return;
        }
        setError(null);
        setIsLoading(true);
        try {
            await onSubmit(resume, digitalFootprint, references);
            onClose();
        } catch (err) {
            setError("Failed to generate skills. Please try again.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const textAreaStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y placeholder-slate-400";

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-700 flex items-center space-x-3 relative">
                    <SparklesIcon className="w-6 h-6 text-cyan-400"/>
                    <h2 className="text-xl font-bold text-slate-100">Generate Verified Skills</h2>
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                    <p className="text-sm text-slate-400">Provide your professional information below. The AI will analyze it to create a verified skills graph. The more context you provide, the better the result.</p>
                    <div>
                        <label className="text-slate-300 font-semibold mb-1 block">Resume / CV</label>
                        <textarea value={resume} onChange={e => setResume(e.target.value)} placeholder="Paste your resume text here..." className={textAreaStyles} rows={6}></textarea>
                    </div>
                     <div>
                        <label className="text-slate-300 font-semibold mb-1 block">Digital Footprint</label>
                        <textarea value={digitalFootprint} onChange={e => setDigitalFootprint(e.target.value)} placeholder="e.g., github.com/username, linkedin.com/in/username, yourportfolio.com" className={textAreaStyles} rows={3}></textarea>
                    </div>
                     <div>
                        <label className="text-slate-300 font-semibold mb-1 block">References</label>
                        <textarea value={references} onChange={e => setReferences(e.target.value)} placeholder={`e.g., "Jane was instrumental in the success of Project X..." - John Doe, Manager`} className={textAreaStyles} rows={3}></textarea>
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                </div>

                <div className="p-4 border-t border-slate-700 flex justify-end">
                    <button 
                        onClick={handleSubmit} 
                        disabled={isLoading}
                        className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-full hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500 flex items-center justify-center min-w-[120px]"
                    >
                        {isLoading ? <LoadingIcon className="w-5 h-5 animate-spin" /> : 'Generate'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SkillsGraphModal;