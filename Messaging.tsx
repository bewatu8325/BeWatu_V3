import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Message } from '../types';
import { analyzeMessageTone } from '../services/geminiService';
import { SparklesIcon, LoadingIcon } from '../constants';

interface MessagingProps {
    users: User[];
    messages: Message[];
    currentUser: User;
    onSendMessage: (receiverId: number, text: string) => void;
    initialActiveUserId: number | null;
}

const Messaging: React.FC<MessagingProps> = ({ users, messages, currentUser, onSendMessage, initialActiveUserId }) => {
    const [activeChatUserId, setActiveChatUserId] = useState<number | null>(initialActiveUserId);
    const [messageText, setMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const [toneAnalysisResult, setToneAnalysisResult] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

    const conversationPartners = useMemo(() => {
        const partnerIds = new Set<number>();
        messages.forEach(msg => {
            if (msg.senderId === currentUser.id) partnerIds.add(msg.receiverId);
            if (msg.receiverId === currentUser.id) partnerIds.add(msg.senderId);
        });
        if (initialActiveUserId) partnerIds.add(initialActiveUserId);
        return users.filter(user => partnerIds.has(user.id));
    }, [messages, currentUser.id, users, initialActiveUserId]);

    const activeChatPartner = users.find(u => u.id === activeChatUserId);

    const sharedGoals = useMemo(() => {
        if (!activeChatPartner || !currentUser.professionalGoals || !activeChatPartner.professionalGoals) {
            return [];
        }
        return currentUser.professionalGoals.filter(goal => 
            activeChatPartner.professionalGoals.includes(goal)
        );
    }, [currentUser, activeChatPartner]);

    const messagesForActiveChat = useMemo(() => {
        if (!activeChatUserId) return [];
        return messages
            .filter(msg =>
                (msg.senderId === currentUser.id && msg.receiverId === activeChatUserId) ||
                (msg.senderId === activeChatUserId && msg.receiverId === currentUser.id)
            )
            .sort((a, b) => a.id - b.id);
    }, [messages, currentUser.id, activeChatUserId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messagesForActiveChat]);

    useEffect(() => {
        setToneAnalysisResult(null);
        setIsAnalyzing(false);
    }, [activeChatUserId]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (messageText.trim() && activeChatUserId) {
            onSendMessage(activeChatUserId, messageText);
            setMessageText('');
            setToneAnalysisResult(null);
        }
    };

    const handleAnalyzeTone = async () => {
        if (!messageText.trim() || isAnalyzing) return;
        setIsAnalyzing(true);
        setToneAnalysisResult(null);
        try {
            const result = await analyzeMessageTone(messageText);
            setToneAnalysisResult(result);
        } catch (error) {
            setToneAnalysisResult("Could not analyze tone at this time.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden h-[calc(100vh-8rem)] flex">
            {/* Conversation List */}
            <div className="w-1/3 border-r border-slate-700 overflow-y-auto">
                <h2 className="text-lg font-bold p-4 border-b border-slate-700 text-slate-200">Conversations</h2>
                {conversationPartners.map(user => (
                    <div key={user.id}
                        onClick={() => setActiveChatUserId(user.id)}
                        className={`p-4 flex items-center space-x-3 cursor-pointer hover:bg-slate-700/50 ${activeChatUserId === user.id ? 'bg-cyan-900/30' : ''}`}>
                        <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full object-cover"/>
                        <div>
                            <p className="font-semibold text-slate-200">{user.name}</p>
                            <p className="text-sm text-slate-400 truncate">{user.headline}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chat Window */}
            <div className="w-2/3 flex flex-col">
                {activeChatPartner ? (
                    <>
                        <div className="p-4 border-b border-slate-700 flex items-center space-x-3">
                             <img src={activeChatPartner.avatarUrl} alt={activeChatPartner.name} className="w-10 h-10 rounded-full object-cover"/>
                             <h2 className="text-lg font-bold text-slate-200">{activeChatPartner.name}</h2>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto bg-slate-900/50 space-y-4">
                           {messagesForActiveChat.map(msg => (
                               <div key={msg.id} className={`flex ${msg.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                                   <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-2xl ${msg.senderId === currentUser.id ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-200'}`}>
                                      <p>{msg.text}</p>
                                      <p className={`text-xs mt-1 ${msg.senderId === currentUser.id ? 'text-cyan-900/70' : 'text-slate-400'}`}>{msg.timestamp}</p>
                                   </div>
                               </div>
                           ))}
                           <div ref={messagesEndRef} />
                        </div>

                        {sharedGoals.length > 0 && (
                            <div className="p-3 border-y border-slate-700 bg-cyan-900/20 text-center">
                                <p className="text-sm text-cyan-300">
                                    <span className="font-semibold">Conversation Starter:</span> You both share an interest in <span className="font-bold">"{sharedGoals[0]}"</span>.
                                </p>
                            </div>
                        )}

                        <div className="p-4 border-t border-slate-700">
                            <form onSubmit={handleSendMessage} className="flex space-x-2">
                                <input type="text"
                                    value={messageText}
                                    onChange={e => setMessageText(e.target.value)}
                                    placeholder="Type a message..."
                                    className="w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400"
                                />
                                <button 
                                    type="button" 
                                    onClick={handleAnalyzeTone}
                                    className="bg-slate-700 text-cyan-400 font-semibold px-4 py-2 rounded-lg border border-cyan-500/50 hover:bg-cyan-900/50 transition-colors disabled:opacity-50 flex items-center justify-center"
                                    disabled={!messageText.trim() || isAnalyzing}
                                    title="Analyze message tone"
                                >
                                    {isAnalyzing ? <LoadingIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                                </button>
                                <button type="submit" className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500" disabled={!messageText.trim()}>
                                    Send
                                </button>
                            </form>
                             {toneAnalysisResult && (
                                <div className="mt-3 p-3 bg-slate-700 rounded-lg text-sm text-slate-300 border border-slate-600 relative">
                                    <button onClick={() => setToneAnalysisResult(null)} className="absolute top-1 right-2 text-slate-400 hover:text-slate-200 text-lg">&times;</button>
                                    <p className="font-semibold mb-1 text-slate-100">Tone Analysis:</p>
                                    <div className="whitespace-pre-wrap">{toneAnalysisResult}</div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        <p>Select a conversation to start messaging</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Messaging;
