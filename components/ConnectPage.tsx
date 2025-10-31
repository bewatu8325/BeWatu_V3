import React, { useState } from 'react';
import { LogoIcon, SparklesIcon, LoadingIcon } from '../constants';
import Footer from './Footer';
import { polishMessage } from '../services/geminiService';

const ConnectHeader: React.FC<{ onNavigateBack: () => void }> = ({ onNavigateBack }) => (
  <header className="absolute top-0 left-0 right-0 p-6 z-10">
    <div className="container mx-auto flex justify-between items-center">
      <button onClick={onNavigateBack} className="flex items-center text-cyan-400" title="Go to Home">
        <LogoIcon className="h-10 w-auto" />
      </button>
      <button onClick={onNavigateBack} className="font-semibold text-slate-300 hover:text-cyan-400 transition-colors">
        Back to Home
      </button>
    </div>
  </header>
);

const ConnectPage: React.FC<{ onNavigateBack: () => void }> = ({ onNavigateBack }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handlePolish = async () => {
    if (!message.trim()) return;
    setIsPolishing(true);
    setError('');
    try {
      const polished = await polishMessage(message);
      setMessage(polished);
    } catch (err) {
      setError('Sorry, the AI assistant could not polish your message right now.');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      setError('Please fill out all fields.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1000);
  };
  
  const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400";

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-white">
      <ConnectHeader onNavigateBack={onNavigateBack} />
      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-8 shadow-lg animate-fade-in-up">
            {isSubmitted ? (
              <div className="text-center py-8">
                <h2 className="text-3xl font-bold text-cyan-400 mb-4">Thank You!</h2>
                <p className="text-slate-300">Your message has been sent. Our team will get back to you shortly.</p>
                <button onClick={onNavigateBack} className="mt-8 bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors">
                    Back to Home
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-center text-slate-100 mb-2">Connect with Us</h2>
                <p className="text-center text-slate-400 mb-8">Have a question or want to partner with us? Drop us a line.</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                   {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-slate-400 text-sm font-semibold mb-1 block">Your Name</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputStyles} placeholder="Jane Doe" disabled={isSubmitting}/>
                        </div>
                        <div>
                            <label className="text-slate-400 text-sm font-semibold mb-1 block">Your Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyles} placeholder="you@example.com" disabled={isSubmitting}/>
                        </div>
                   </div>
                   <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-slate-400 text-sm font-semibold">Your Message</label>
                            <button 
                                type="button" 
                                onClick={handlePolish} 
                                disabled={isPolishing || !message.trim()}
                                className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPolishing ? <LoadingIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                                <span>Polish with AI</span>
                            </button>
                        </div>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputStyles} min-h-[150px]`} placeholder="Let us know how we can help..." disabled={isSubmitting}></textarea>
                   </div>
                   <button type="submit" className="w-full bg-cyan-500 text-slate-900 font-semibold py-2.5 rounded-lg hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 flex items-center justify-center" disabled={isSubmitting}>
                        {isSubmitting ? <LoadingIcon className="w-5 h-5 animate-spin"/> : 'Send Message'}
                   </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer onNavigateToConnect={() => {}} />
    </div>
  );
};

export default ConnectPage;