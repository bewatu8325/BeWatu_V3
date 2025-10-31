import React from 'react';

const DEIDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
       <div>
         <h1 className="text-2xl font-bold text-slate-100">DEI & Equity Analytics</h1>
         <p className="text-slate-400 text-sm mt-1">Track and improve diversity representation in your hiring funnel.</p>
       </div>

       <div className="bg-slate-800/50 p-8 rounded-xl border border-slate-700 text-center flex flex-col items-center justify-center h-96">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-cyan-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h2 className="text-xl font-bold text-slate-100">Unlock Powerful DEI Insights</h2>
            <p className="text-slate-400 mt-2 max-w-md">This feature is coming soon. Connect your Applicant Tracking System (ATS) to automatically populate this dashboard and gain actionable insights into your hiring pipeline's diversity and equity.</p>
            <button className="mt-6 bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500" disabled>
                Connect ATS (Coming Soon)
            </button>
        </div>
    </div>
  );
};

export default DEIDashboard;