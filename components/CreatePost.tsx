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
    <div className="bg-white p-4 rounded-2xl border shadow-sm" style={{ borderColor: "#e7e5e4" }}>
      <div className="flex items-start space-x-4">
        <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-12 h-12 rounded-full object-cover"/>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isAIAssistMode ? "Enter a topic, and I'll draft a post for you..." : "What's on your mind?"}
          className="w-full p-3 bg-stone-50 text-stone-800 border rounded-xl focus:outline-none focus:ring-2 resize-none placeholder:text-stone-400" style={{ borderColor: "#e7e5e4" }}
          rows={3}
        />
      </div>
      <div className="flex justify-end items-center mt-2 space-x-2">
        <button
          onClick={toggleAIAssist}
          className={`p-2 rounded-full transition-colors ${isAIAssistMode ? 'text-white' : 'text-stone-400 hover:bg-stone-100'}`} style={isAIAssistMode ? { backgroundColor: '#1a4a3a' } : {}}
          title={isAIAssistMode ? "Switch to manual post" : "Generate post with AI"}
        >
          <SparklesIcon className="w-5 h-5"/>
        </button>
        <button
          onClick={handleSubmit}
          className="font-semibold px-6 py-2 rounded-full transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center min-w-[90px] text-white" style={{ backgroundColor: "#1a4a3a" }}
          disabled={!content.trim() || isGenerating}
        >
          {isGenerating ? <LoadingIcon className="w-5 h-5 animate-spin" /> : (isAIAssistMode ? 'Generate' : 'Post')}
        </button>
      </div>
    </div>
  );
};

export default CreatePost;
