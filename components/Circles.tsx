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
      setError(err.message ?? 'Failed to create pod.');
    } finally {
      setIsCreating(false);
    }
  };

  const inputStyles = 'w-full p-2 bg-white text-stone-800 border rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-300 placeholder:text-stone-400" style={{ borderColor: "#e7e5e4" }}';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CirclesIcon className="w-8 h-8" style={{ color:"#1a4a3a" }} />
          <h1 className="text-3xl font-bold text-stone-900">Discover Pods</h1>
        </div>
        {onCreateCircle && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 text-white font-semibold rounded-xl transition hover:opacity-90" style={{ backgroundColor:"#1a4a3a" }}
          >
            + Create Pod
          </button>
        )}
      </div>

      <p className="text-stone-500">Join micro-communities to collaborate, co-learn, and connect with professionals in your domain.</p>

      {circles.length === 0 && (
        <div className="text-center py-16 text-stone-400">
          <CirclesIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">No pods yet.</p>
          <p className="text-sm mt-1">Be the first to create one!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {circles.map(circle => (
          <div
            key={circle.id}
            className="bg-white p-6 rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col" style={{ borderColor:"#e7e5e4" }}
            onClick={() => onSelectCircle(circle.id)}
          >
            <h2 className="text-xl font-bold" style={{ color:"#1a4a3a" }}>{circle.name}</h2>
            <p className="text-stone-600 mt-2 flex-grow">{circle.description}</p>
            <div className="flex items-center justify-between mt-4 text-stone-400 text-sm">
              <div className="flex items-center space-x-2">
                <UsersIcon className="w-4 h-4" />
                <span>{circle.members.length} members</span>
              </div>
              <button className="font-semibold hover:underline" style={{ color:"#1a4a3a" }}>
                View Pod &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border p-6 w-full max-w-md shadow-xl" style={{ borderColor:"#e7e5e4" }}>
            <h2 className="text-xl font-bold text-stone-900 mb-4">Create a Pod</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-2 rounded-xl">
                  {error}
                </p>
              )}
              <div>
                <label className="text-stone-500 text-sm font-semibold mb-1 block">Pod Name</label>
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
                <label className="text-stone-500 text-sm font-semibold mb-1 block">Description</label>
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
                  className="flex-1 py-2 border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-colors"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-white font-semibold rounded-xl transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor:"#1a4a3a" }}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create Pod'}
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
