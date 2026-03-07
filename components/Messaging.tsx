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

    // Mobile: show list or chat, not both
    const showList = !activeChatUserId;

    return (
        <div className="bg-white rounded-2xl border overflow-hidden flex shadow-sm" style={{ borderColor:"#e7e5e4", height: "calc(100svh - 9rem)" }}>
            {/* Conversation List — full width on mobile when no chat selected */}
            <div
              className={`${showList ? 'flex' : 'hidden'} md:flex flex-col md:w-1/3 border-r w-full flex-shrink-0 overflow-y-auto`}
              style={{ borderColor:"#e7e5e4" }}
            >
                <h2 className="text-lg font-bold p-4 border-b text-stone-900 flex-shrink-0" style={{ borderColor:"#e7e5e4" }}>Messages</h2>
                {conversationPartners.length === 0 && (
                  <p className="p-6 text-sm text-stone-400 text-center">No conversations yet</p>
                )}
                {conversationPartners.map(user => (
                    <div key={user.id}
                        onClick={() => setActiveChatUserId(user.id)}
                        className={`p-4 flex items-center space-x-3 cursor-pointer transition-colors flex-shrink-0 ${activeChatUserId === user.id ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                        <img src={user.avatarUrl} alt={user.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0"/>
                        <div className="min-w-0">
                            <p className="font-semibold text-stone-900 truncate">{user.name}</p>
                            <p className="text-sm text-stone-500 truncate">{user.headline}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chat Window — full width on mobile when chat selected */}
            <div className={`${!showList ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0`}>
                {activeChatPartner ? (
                    <>
                        <div className="p-3 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor:"#e7e5e4" }}>
                             <button
                               className="md:hidden p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 mr-1"
                               onClick={() => setActiveChatUserId(null)}
                             >
                               <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                             </button>
                             <img src={activeChatPartner.avatarUrl} alt={activeChatPartner.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0"/>
                             <div className="min-w-0">
                               <h2 className="text-base font-bold text-stone-900 truncate">{activeChatPartner.name}</h2>
                               <p className="text-xs text-stone-400 truncate">{activeChatPartner.headline}</p>
                             </div>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto bg-stone-50 space-y-4">
                           {messagesForActiveChat.map(msg => (
                               <div key={msg.id} className={`flex ${msg.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                                   <div className={`max-w-[75vw] sm:max-w-xs md:max-w-md p-3 rounded-2xl ${msg.senderId === currentUser.id ? 'text-white' : 'bg-white text-stone-800 border'}`} style={msg.senderId === currentUser.id ? { backgroundColor:'#1a4a3a' } : { borderColor:'#e7e5e4' }}>
                                      <p>{msg.text}</p>
                                      <p className={`text-xs mt-1 ${msg.senderId === currentUser.id ? 'text-white/60' : 'text-stone-400'}`}>{msg.timestamp}</p>
                                   </div>
                               </div>
                           ))}
                           <div ref={messagesEndRef} />
                        </div>

                        {sharedGoals.length > 0 && (
                            <div className="p-3 border-y text-center" style={{ backgroundColor:"#e8f4f0", borderColor:"#1a6b52" }}>
                                <p className="text-sm" style={{ color:"#1a4a3a" }}>
                                    <span className="font-semibold">Conversation Starter:</span> You both share an interest in <span className="font-bold">"{sharedGoals[0]}"</span>.
                                </p>
                            </div>
                        )}

                        <div className="p-4 border-t" style={{ borderColor:"#e7e5e4" }}>
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <input type="text"
                                    value={messageText}
                                    onChange={e => setMessageText(e.target.value)}
                                    placeholder="Type a message..."
                                    className="w-full p-2 bg-stone-50 text-stone-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400" style={{ borderColor:"#e7e5e4" }}
                                />
                                <button 
                                    type="button" 
                                    onClick={handleAnalyzeTone}
                                    className="border font-semibold px-4 py-2 rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-50 flex items-center justify-center" style={{ borderColor:"#1a4a3a", color:"#1a4a3a" }}
                                    disabled={!messageText.trim() || isAnalyzing}
                                    title="Analyze message tone"
                                >
                                    {isAnalyzing ? <LoadingIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                                </button>
                                <button type="submit" className="text-white font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition disabled:opacity-50 flex-shrink-0" style={{ backgroundColor:"#1a4a3a" }} disabled={!messageText.trim()}>
                                    Send
                                </button>
                            </form>
                             {toneAnalysisResult && (
                                <div className="mt-3 p-3 bg-stone-50 rounded-xl text-sm text-stone-700 border relative" style={{ borderColor:"#e7e5e4" }}>
                                    <button onClick={() => setToneAnalysisResult(null)} className="absolute top-1 right-2 text-stone-400 hover:text-stone-700 text-lg">&times;</button>
                                    <p className="font-semibold mb-1 text-stone-900">Tone Analysis:</p>
                                    <div className="whitespace-pre-wrap">{toneAnalysisResult}</div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-stone-400">
                        <p>Select a conversation to start messaging</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Messaging;
