import React, { useState } from 'react';
import { Job, Company } from '../../types';
import JobEditorModal from './JobEditorModal';
import { useTranslation } from '../../hooks/useTranslation';

interface ManageJobsViewProps {
    jobs: Job[];
    companies: Company[];
    recruiterId: number;
    onAddJob: (jobData: Omit<Job, 'id'>) => void;
    onUpdateJob: (job: Job) => void;
    onDeleteJob: (jobId: number) => void;
    onToggleJobStatus: (jobId: number, currentStatus: 'Active' | 'Suspended') => void;
}

const JobStatusBadge: React.FC<{ job: Job }> = ({ job }) => {
    const { t } = useTranslation();
    const now = new Date();
    const liveDate = new Date(job.liveDate);
    const expiryDate = new Date(job.expiryDate);

    if (job.status === 'Suspended') {
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-900 text-yellow-300">{t('suspend')}ed</span>;
    }
    if (now > expiryDate) {
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-900 text-red-300">{t('expired')}</span>;
    }
    if (now < liveDate) {
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900 text-blue-300">{t('scheduled')}</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-900 text-green-300">{t('activate')}d</span>;
};

const ManageJobsView: React.FC<ManageJobsViewProps> = ({ jobs, companies, recruiterId, onAddJob, onUpdateJob, onDeleteJob, onToggleJobStatus }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const { t } = useTranslation();

    const openCreateModal = () => {
        setEditingJob(null);
        setIsModalOpen(true);
    };

    const openEditModal = (job: Job) => {
        setEditingJob(job);
        setIsModalOpen(true);
    };

    const getCompanyName = (companyId: number) => companies.find(c => c.id === companyId)?.name || 'Unknown';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">{t('manageJobs')}</h1>
                    <p className="text-slate-400 text-sm mt-1">{t('manageJobsDesc')}</p>
                </div>
                <button onClick={openCreateModal} className="bg-cyan-500 text-slate-900 font-semibold px-5 py-2 rounded-lg hover:bg-cyan-400 transition-colors">
                    {t('postNewRole')}
                </button>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-300">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">{t('jobTitle')}</th>
                                <th scope="col" className="px-6 py-3">{t('company')}</th>
                                <th scope="col" className="px-6 py-3">{t('liveDate')}</th>
                                <th scope="col" className="px-6 py-3">{t('expiryDate')}</th>
                                <th scope="col" className="px-6 py-3">{t('status')}</th>
                                <th scope="col" className="px-6 py-3 text-right">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map(job => (
                                <tr key={job.id} className="border-b border-slate-700 hover:bg-slate-800">
                                    <td className="px-6 py-4 font-semibold text-slate-100">{job.title}</td>
                                    <td className="px-6 py-4">{getCompanyName(job.companyId)}</td>
                                    <td className="px-6 py-4">{new Date(job.liveDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">{new Date(job.expiryDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <JobStatusBadge job={job} />
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                                        <button onClick={() => onToggleJobStatus(job.id, job.status)} className="font-medium text-yellow-400 hover:underline">
                                            {job.status === 'Active' ? t('suspend') : t('activate')}
                                        </button>
                                        <button onClick={() => openEditModal(job)} className="font-medium text-cyan-400 hover:underline">{t('edit')}</button>
                                        <button onClick={() => onDeleteJob(job.id)} className="font-medium text-red-500 hover:underline">{t('delete')}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {jobs.length === 0 && <p className="text-center text-slate-400 p-8">{t('noJobsPosted')}</p>}
            </div>

            {isModalOpen && (
                <JobEditorModal
                    job={editingJob}
                    companies={companies}
                    recruiterId={recruiterId}
                    onClose={() => setIsModalOpen(false)}
                    onSave={(jobData) => {
                        if (editingJob) {
                            onUpdateJob({ ...editingJob, ...jobData } as Job);
                        } else {
                            onAddJob(jobData as Omit<Job, 'id'>);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default ManageJobsView;