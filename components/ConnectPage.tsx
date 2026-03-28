import React, { useState } from 'react';
import { LogoIcon } from '../constants';
import Footer from './Footer';

const GREEN = '#1a4a3a';
const BG    = '#f0ede6';

const ConnectPage: React.FC<{ onNavigateBack: () => void }> = ({ onNavigateBack }) => {
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [message, setMessage]     = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted]   = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      setError('Please fill out all fields.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1000);
  };

  const inputStyles = "w-full px-4 py-2.5 rounded-xl border bg-white text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:border-stone-400 text-sm transition-colors";
  const borderStyle = { borderColor: '#e8e4dc' };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: BG }}>

      {/* Nav */}
      <header className="sticky top-0 z-20 border-b" style={{ backgroundColor: BG, borderColor: '#e8e4dc' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button onClick={onNavigateBack} className="flex items-center shrink-0">
            <LogoIcon className="h-9 w-auto" style={{ color: GREEN }} />
          </button>
          <button
            onClick={onNavigateBack}
            className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl">

          {isSubmitted ? (
            <div className="bg-white rounded-2xl border p-12 text-center shadow-sm" style={borderStyle}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: '#d1fae5' }}>
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#1a6b52" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-extrabold text-stone-900 mb-2">Message sent</h2>
              <p className="text-stone-500 text-sm mb-8">
                Thanks for reaching out. We'll get back to you shortly.
              </p>
              <button
                onClick={onNavigateBack}
                className="rounded-full px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                Back to home
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border p-8 shadow-sm" style={borderStyle}>
              <div className="text-center mb-8">
                <span className="inline-block text-xs font-bold rounded-full px-3 py-1 mb-4"
                  style={{ backgroundColor: `${GREEN}12`, color: GREEN, border: `1px solid ${GREEN}25` }}>
                  Get in touch
                </span>
                <h1 className="text-3xl font-extrabold text-stone-900 mb-2">Connect with us</h1>
                <p className="text-stone-500 text-sm">
                  Have a question, want to partner, or just want to say hello?
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <p className="text-xs text-red-500 text-center bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    {error}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-widest">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className={inputStyles}
                      style={borderStyle}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-widest">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputStyles}
                      style={borderStyle}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-widest">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Let us know how we can help, or what you're building..."
                    rows={5}
                    className={inputStyles}
                    style={{ ...borderStyle, resize: 'vertical' }}
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: GREEN }}
                >
                  {isSubmitting ? 'Sending…' : 'Send message'}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer onNavigateToConnect={() => {}} />
    </div>
  );
};

export default ConnectPage;
