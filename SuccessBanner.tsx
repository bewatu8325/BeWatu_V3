import React, { useEffect } from 'react';

interface SuccessBannerProps {
  message: string;
  onClose: () => void;
}

const SuccessBanner: React.FC<SuccessBannerProps> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000); // Auto-close after 4 seconds

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-5 right-5 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-up border border-green-500">
      <div className="flex items-center">
        <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <p className="font-semibold">{message}</p>
        <button onClick={onClose} className="ml-6 text-green-100 hover:text-white text-2xl font-bold leading-none">&times;</button>
      </div>
    </div>
  );
};

export default SuccessBanner;
