import React, { useState } from 'react';
import { User } from '../types';
import { generatePost } from '../services/geminiService';
import { SparklesIcon, LoadingIcon } from '../constants';

interface CreatePostProps {
  addPost: (content: string, circleId?: number) => void;
  currentUser: User;
  circleId?: number;
}

const CreatePost: React.FC<CreatePostProps> = ({ addPost, currentUser, circleId }) => {
  const [content, setContent] = useState('');
  const [isAIAssistMode, setIsAIAssistMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (isAIAssistMode) {
      // AI Generation Logic
      setIsGenerating(true);
      try {
        const generatedContent = await generatePost(content, currentUser);
        setContent(generatedContent);
      } catch (error) {
        console.error("Post generation failed", error);
        setContent("Sorry, I couldn't generate a post right now. Please try again.");
      } finally {
        setIsGenerating(false);
        setIsAIAssistMode(false);
      }
    } else {
      // Regular Post Logic
      addPost(content, circleId);
      setContent('');
    }
  };
  
  const toggleAIAssist = () => {
    setIsAIAssistMode(!isAIAssistMode);
  };

  return (
    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
      <div className="flex items-start space-x-4">
        <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full object-cover"/>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isAIAssistMode ? "Enter a topic, and I'll draft a post for you..." : "What's on your mind?"}
          className="w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none placeholder-slate-400"
          rows={3}
        />
      </div>
      <div className="flex justify-end items-center mt-2 space-x-2">
        <button
          onClick={toggleAIAssist}
          className={`p-2 rounded-full transition-colors ${isAIAssistMode ? 'bg-cyan-900/50 text-cyan-400' : 'text-slate-400 hover:bg-slate-700'}`}
          title={isAIAssistMode ? "Switch to manual post" : "Generate post with AI"}
        >
          <SparklesIcon className="w-5 h-5"/>
        </button>
        <button
          onClick={handleSubmit}
          className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-full hover:bg-cyan-400 transition-colors disabled:bg-cyan-800 disabled:text-slate-500 flex items-center justify-center min-w-[90px]"
          disabled={!content.trim() || isGenerating}
        >
          {isGenerating ? <LoadingIcon className="w-5 h-5 animate-spin" /> : (isAIAssistMode ? 'Generate' : 'Post')}
        </button>
      </div>
    </div>
  );
};

export default CreatePost;