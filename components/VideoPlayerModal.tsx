import React from 'react';

interface VideoPlayerModalProps {
    videoUrl: string;
    onClose: () => void;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ videoUrl, onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-2xl flex flex-col relative"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-300 z-10 bg-black/50 rounded-full p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <video className="w-full rounded-xl" src={videoUrl} controls autoPlay>
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    );
};

export default VideoPlayerModal;
