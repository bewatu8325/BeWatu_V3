import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { BotIcon } from '../constants';
import { useTranslation } from '../hooks/useTranslation';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface AIChatProps {
  currentUser: User;
}

const AIChat: React.FC<AIChatProps> = ({ currentUser }) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const systemInstruction = `You are an expert career co-pilot integrated into the BeWatu professional network. Your name is 'Be'. Your goal is to provide insightful, supportive, and actionable advice to users. You can help with crafting narratives, finding synergies between profiles, preparing for conversations, brainstorming career paths, and offering interview prep. Be encouraging, professional, and slightly futuristic in your tone to match the platform's Gen-Z aesthetic. Your first message should be a welcoming greeting.`;

  // Function to start a new chat session, including getting the initial greeting
  const startNewChat = async () => {
      setIsLoading(true);
      setError(null);
      try {
          const response = await fetch('/api/gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  model: 'gemini-2.5-flash',
                  contents: {
                      history: [], // No history for the first message
                      systemInstruction: systemInstruction,
                      generationConfig: { candidateCount: 1 }
                  },
                  isChat: true,
                  userMessage: "Hello! Introduce yourself."
              }),
          });
          if (!response.ok) throw new Error('Failed to start chat session');
          
          const data = await response.json();
          setHistory([{ role: 'model', parts: [{ text: data.text }] }]);
      } catch (err) {
          console.error("AI Chat initial message failed:", err);
          setError("Failed to connect with Be. Please try again later.");
          setHistory([{ role: 'model', parts: [{ text: "Hello! I'm Be, your AI Career Assistant. I seem to be having a little trouble connecting right now, but I'm here to help you navigate your professional journey." }] }]);
      } finally {
          setIsLoading(false);
      }
  };
  
  useEffect(() => {
    startNewChat();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: userInput }] };
    const newHistory = [...history, userMessage];
    
    setHistory(newHistory);
    const currentInput = userInput;
    setUserInput('');
    setIsLoading(true);
    setError(null);

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                contents: {
                    history: history, // Send the current history
                    systemInstruction: systemInstruction,
                    generationConfig: { candidateCount: 1 }
                },
                isChat: true,
                userMessage: currentInput
            }),
        });
        if (!response.ok) throw new Error('API response was not ok.');
        
        const data = await response.json();
        setHistory(prev => [...prev, { role: 'model', parts: [{ text: data.text }] }]);

    } catch (error) {
      console.error("AI Chat Error:", error);
      setError("I'm having trouble connecting right now. Please try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden h-[calc(100vh-8rem)] flex flex-col">
      <div className="p-4 border-b border-slate-700 flex items-center space-x-3">
        <div className="p-2 bg-cyan-900/50 rounded-full border border-cyan-500/30">
            <BotIcon className="w-6 h-6 text-cyan-400"/>
        </div>
        <div>
            <h2 className="text-lg font-bold text-slate-200">{t('be')}</h2>
            <p className="text-sm text-slate-400">{t('beDescription')}</p>
        </div>
      </div>

      <div className="flex-grow p-4 overflow-y-auto bg-slate-900/50 space-y-6">
        {history.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'model' && (
                <div className="w-10 h-10 rounded-full flex-shrink-0 bg-slate-700 flex items-center justify-center border border-slate-600">
                    <BotIcon className="w-6 h-6 text-cyan-400"/>
                </div>
            )}
            <div className={`max-w-xl p-3 rounded-2xl prose prose-invert prose-p:text-slate-200 ${msg.role === 'user' ? 'bg-cyan-500 text-slate-900 rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
              <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
            </div>
            {msg.role === 'user' && (
                <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            )}
          </div>
        ))}
        {isLoading && (
             <div className="flex items-start gap-3 justify-start">
                <div className="w-10 h-10 rounded-full flex-shrink-0 bg-slate-700 flex items-center justify-center border border-slate-600">
                    <BotIcon className="w-6 h-6 text-cyan-400"/>
                </div>
                 <div className="max-w-xl p-3 rounded-2xl bg-slate-700 text-slate-200 rounded-bl-none flex items-center space-x-2">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-0"></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-150"></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-300"></span>
                 </div>
             </div>
        )}
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-slate-700">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder={t('askForAdvice')}
            className="w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400"
            disabled={isLoading}
          />
          <button type="submit" className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500" disabled={isLoading || !userInput.trim()}>
            {t('send')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIChat;