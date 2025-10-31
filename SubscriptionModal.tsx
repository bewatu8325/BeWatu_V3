import React from 'react';
import { LogoIcon } from '../../constants';

interface SubscriptionModalProps {
  onClose: () => void;
  onSubscribe: () => void;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSubscribe }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center backdrop-blur-sm">
      <div 
        className="bg-slate-800/90 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-md text-center p-8"
        onClick={e => e.stopPropagation()}
      >
        <LogoIcon className="h-10 w-auto text-cyan-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-100">Your Trial Has Ended</h2>
        <p className="text-slate-300 mt-2">
          Continue accessing the powerful AI-driven Recruiter Console and find the perfect candidates.
        </p>
        <div className="my-6 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
            <p className="text-slate-200 font-semibold">BeWatu Recruiter Pro</p>
            <p className="text-4xl font-bold text-cyan-400 mt-1">$20<span className="text-lg font-normal text-slate-400">/month</span></p>
        </div>
        <ul className="text-left space-y-2 text-slate-300 text-sm">
          <li className="flex items-center"><span className="text-cyan-400 mr-2">✓</span> Smart, context-aware candidate search</li>
          <li className="flex items-center"><span className="text-cyan-400 mr-2">✓</span> Transparent AI matching scores</li>
          <li className="flex items-center"><span className="text-cyan-400 mr-2">✓</span> Advanced filtering by intent & values</li>
        </ul>
        <button 
          onClick={onSubscribe}
          className="w-full mt-8 bg-cyan-500 text-slate-900 font-semibold py-2.5 rounded-lg hover:bg-cyan-400 transition-colors"
        >
          Subscribe Now
        </button>
        <button 
          onClick={onClose}
          className="mt-3 text-sm text-slate-400 hover:text-slate-200"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
};

export default SubscriptionModal;