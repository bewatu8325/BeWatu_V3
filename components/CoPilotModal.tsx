import React from 'react';
import { LoadingIcon, SparklesIcon } from '../constants';

interface CoPilotModalProps {
    title: string;
    isLoading: boolean;
    content: string | null;
    onClose: () => void;
}

const CoPilotModal: React.FC<CoPilotModalProps> = ({ title, isLoading, content, onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-700 flex items-center space-x-3 relative">
                    <SparklesIcon className="w-6 h-6 text-cyan-400"/>
                    <h2 className="text-xl font-bold text-slate-100">{title}</h2>
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center h-48">
                            <LoadingIcon className="w-12 h-12 animate-spin text-cyan-400" />
                            <p className="mt-4 text-slate-300">Your co-pilot is thinking...</p>
                        </div>
                    )}
                    {content && !isLoading && (
                        <div className="text-slate-300 whitespace-pre-wrap prose prose-invert prose-p:text-slate-300 prose-headings:text-slate-100 prose-strong:text-slate-100">
                            {content}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CoPilotModal;