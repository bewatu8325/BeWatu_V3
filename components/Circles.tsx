import React, { useState } from 'react';
import { Circle } from '../types';
import { CirclesIcon, UsersIcon } from '../constants';

interface CirclesProps {
  circles: Circle[];
  onSelectCircle: (circleId: number) => void;
  onCreateCircle?: (name: string, description: string) => Promise<void>;
  currentUserId?: number;
}

const Circles: React.FC<CirclesProps> = ({ circles, onSelectCircle, onCreateCircle, currentUserId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (!onCreateCircle) return;
    try {
      setIsCreating(true);
      setError('');
      await onCreateCircle(name.trim(), description.trim());
      setName('');
      setDescription('');
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create circle.');
    } finally {
      setIsCreating(false);
    }
  };

  const inputStyles = 'w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CirclesIcon className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold text-slate-100">Discover Circles</h1>
        </div>
        {onCreateCircle && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors"
          >
            + Create Circle
          </button>
        )}
      </div>

      <p className="text-slate-400">Join micro-communities to collaborate, co-learn, and connect with professionals in your domain.</p>

      {circles.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <CirclesIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">No circles yet.</p>
          <p className="text-sm mt-1">Be the first to create one!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {circles.map(circle => (
          <div
            key={circle.id}
            className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer flex flex-col"
            onClick={() => onSelectCircle(circle.id)}
          >
            <h2 className="text-xl font-bold text-purple-400">{circle.name}</h2>
            <p className="text-slate-300 mt-2 flex-grow">{circle.description}</p>
            <div className="flex items-center justify-between mt-4 text-slate-400 text-sm">
              <div className="flex items-center space-x-2">
                <UsersIcon className="w-4 h-4" />
                <span>{circle.members.length} members</span>
              </div>
              <button className="font-semibold text-cyan-400 hover:text-cyan-300">
                View Circle &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-100 mb-4">Create a Circle</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-500/30 p-2 rounded-md">
                  {error}
                </p>
              )}
              <div>
                <label className="text-slate-400 text-sm font-semibold mb-1 block">Circle Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={inputStyles}
                  placeholder="e.g. Frontend Engineers"
                  disabled={isCreating}
                />
              </div>
              <div>
                <label className="text-slate-400 text-sm font-semibold mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={`${inputStyles} resize-none`}
                  rows={3}
                  placeholder="What is this circle about?"
                  disabled={isCreating}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setError(''); setName(''); setDescription(''); }}
                  className="flex-1 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create Circle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Circles;
