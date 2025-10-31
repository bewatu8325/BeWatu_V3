import React from 'react';
import { Company, Job } from '../types';

interface CompanyProfileModalProps {
    company: Company | null;
    allJobs: Job[];
    onClose: () => void;
}

const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({ company, allJobs, onClose }) => {
    if (!company) return null;

    const companyJobs = allJobs.filter(job => job.companyId === company.id);

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
                <div className="p-6 border-b border-slate-700 flex items-start space-x-4 relative">
                    <img src={company.logoUrl} alt={`${company.name} logo`} className="w-16 h-16 rounded-md object-cover border border-slate-600"/>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-100">{company.name}</h2>
                        <p className="text-md text-slate-400">{company.industry}</p>
                        <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:underline">
                            Visit website
                        </a>
                    </div>
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    <h3 className="font-semibold text-slate-200 mb-2">About {company.name}</h3>
                    <p className="text-slate-300 mb-6">{company.description}</p>

                    <h3 className="font-semibold text-slate-200 mb-4">Open Positions ({companyJobs.length})</h3>
                    <div className="space-y-4">
                        {companyJobs.length > 0 ? (
                            companyJobs.map(job => (
                                <div key={job.id} className="p-4 rounded-lg border border-slate-700 hover:border-cyan-700/50 bg-slate-900/50">
                                    <h4 className="font-bold text-cyan-400">{job.title}</h4>
                                    <p className="text-sm text-slate-400">{job.location} ({job.type})</p>
                                </div>
                            ))
                        ) : (
                            <p className="text-slate-400">No open positions at this time.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CompanyProfileModal;