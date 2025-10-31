import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LoadingIcon, CameraIcon } from '../constants';

interface VideoRecorderModalProps {
    onSave: (videoUrl: string) => void;
    onClose: () => void;
}

const MAX_DURATION = 30; // 30 seconds

const VideoRecorderModal: React.FC<VideoRecorderModalProps> = ({ onSave, onClose }) => {
    const [permission, setPermission] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
    const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'recorded'>('idle');
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(MAX_DURATION);

    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);

    const getPermissions = useCallback(async () => {
        setPermission('pending');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setRecordedVideoUrl(url);
                setRecordingStatus('recorded');
                recordedChunksRef.current = [];
            };
            setPermission('granted');
        } catch (err) {
            console.error("Error accessing media devices.", err);
            setPermission('denied');
        }
    }, []);

    const startRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
            setRecordingStatus('recording');
            mediaRecorderRef.current.start();
            setCountdown(MAX_DURATION);
            timerRef.current = window.setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        stopRecording();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            if(timerRef.current) window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };
    
    const handleSave = () => {
        if (recordedVideoUrl) {
            onSave(recordedVideoUrl);
        }
    };

    const handleRetake = () => {
        setRecordedVideoUrl(null);
        setRecordingStatus('idle');
        setCountdown(MAX_DURATION);
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
            if (videoRef.current?.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-xl flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-700 flex items-center space-x-3 relative">
                    <CameraIcon className="w-6 h-6 text-cyan-400"/>
                    <h2 className="text-xl font-bold text-slate-100">Record Micro-Introduction</h2>
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                        {permission === 'denied' && <div className="flex items-center justify-center h-full text-red-400">Camera access denied. Please enable it in your browser settings.</div>}
                        {permission === 'pending' && <div className="flex items-center justify-center h-full text-slate-300"><LoadingIcon className="w-8 h-8 animate-spin" /></div>}
                        
                        <video ref={videoRef} autoPlay muted={recordingStatus !== 'recorded'} playsInline className="w-full h-full object-cover" src={recordedVideoUrl || undefined}></video>

                        {recordingStatus === 'recording' && (
                             <div className="absolute top-2 right-2 bg-red-500 text-white text-sm font-bold px-2 py-1 rounded">
                                REC 00:{countdown.toString().padStart(2, '0')}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-700 flex justify-center items-center space-x-4 h-[76px]">
                    {permission === 'idle' && <button onClick={getPermissions} className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-full hover:bg-cyan-400">Enable Camera</button>}
                    {permission === 'granted' && recordingStatus === 'idle' && (
                        <button onClick={startRecording} className="w-16 h-16 bg-red-500 rounded-full border-4 border-slate-700 hover:bg-red-400 transition-colors"></button>
                    )}
                    {permission === 'granted' && recordingStatus === 'recording' && (
                         <button onClick={stopRecording} className="w-16 h-16 bg-red-500 rounded-md border-4 border-slate-700 hover:bg-red-400 transition-colors"></button>
                    )}
                    {permission === 'granted' && recordingStatus === 'recorded' && (
                        <>
                            <button onClick={handleRetake} className="bg-slate-600 text-slate-200 font-semibold px-6 py-2 rounded-full hover:bg-slate-500">Retake</button>
                            <button onClick={handleSave} className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-full hover:bg-cyan-400">Save & Use</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoRecorderModal;