import React, { useState } from 'react';
import { Circle } from '../types';
import { Users, Plus, X, ArrowRight, Hexagon, Sparkles } from 'lucide-react';

interface CirclesProps {
  circles: Circle[];
  onSelectCircle: (circleId: number) => void;
  onCreateCircle?: (name: string, description: string) => Promise<void>;
  currentUserId?: number;
}

// Deterministic colour per pod name — warm, distinct palette
const POD_PALETTES = [
  { bg: '#fef3c7', border: '#fde68a', text: '#92400e', dot: '#f59e0b' },
  { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46', dot: '#10b981' },
  { bg: '#ede9fe', border: '#ddd6fe', text: '#4c1d95', dot: '#8b5cf6' },
  { bg: '#fce7f3', border: '#fbcfe8', text: '#831843', dot: '#ec4899' },
  { bg: '#dbeafe', border: '#bfdbfe', text: '#1e3a8a', dot: '#3b82f6' },
  { bg: '#ffedd5', border: '#fed7aa', text: '#7c2d12', dot: '#f97316' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#14532d', dot: '#22c55e' },
  { bg: '#fdf4ff', border: '#f5d0fe', text: '#581c87', dot: '#d946ef' },
];

function getPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return POD_PALETTES[Math.abs(hash) % POD_PALETTES.length];
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Fake member avatars — coloured initials rings
function MemberRings({ count }: { count: number }) {
  const show = Math.min(count, 4);
  const colours = ['#1a4a3a', '#7c3aed', '#d97706', '#0891b2', '#be185d'];
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {Array.from({ length: show }).map((_, i) => (
          <div key={i}
            className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: colours[i % colours.length], zIndex: show - i }}>
            {String.fromCharCode(65 + i)}
          </div>
        ))}
      </div>
      {count > 4 && (
        <span className="ml-2 text-xs text-stone-400">+{count - 4}</span>
      )}
    </div>
  );
}

const Circles: React.FC<CirclesProps> = ({
  circles, onSelectCircle, onCreateCircle, currentUserId,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName]             = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError]           = useState('');
  const [hoveredId, setHoveredId]   = useState<number | null>(null);

  const myPods    = circles.filter(c => currentUserId && c.members.includes(currentUserId));
  const otherPods = circles.filter(c => !currentUserId || !c.members.includes(currentUserId));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) { setError('Please fill in all fields.'); return; }
    if (!onCreateCircle) return;
    try {
      setIsCreating(true); setError('');
      await onCreateCircle(name.trim(), description.trim());
      setName(''); setDescription(''); setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create pod.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Pods</h1>
          <p className="text-stone-500 mt-1 text-sm max-w-md">
            Small, intentional communities built around shared goals, industries, and career stages.
            Find your people.
          </p>
        </div>
        {onCreateCircle && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl text-sm hover:opacity-90 transition-all shadow-sm"
            style={{ backgroundColor: '#1a4a3a' }}
          >
            <Plus size={15} /> Start a pod
          </button>
        )}
      </div>

      {circles.length === 0 ? (
        /* ── Empty state ── */
        <div className="text-center py-24 border-2 border-dashed border-stone-200 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <Hexagon size={28} className="text-stone-300" />
          </div>
          <p className="font-bold text-stone-700 text-lg mb-1">No pods yet</p>
          <p className="text-stone-400 text-sm mb-6 max-w-xs mx-auto">
            Pods are where real conversations happen. Start one around your domain, career stage, or shared goal.
          </p>
          {onCreateCircle && (
            <button onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-all"
              style={{ backgroundColor: '#1a4a3a' }}>
              <Plus size={14} /> Create the first pod
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── My pods ── */}
          {myPods.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-amber-500" />
                <h2 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Your pods</h2>
                <span className="text-xs bg-stone-100 text-stone-500 rounded-full px-2 py-0.5">{myPods.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {myPods.map(circle => {
                  const pal = getPalette(circle.name);
                  const isHovered = hoveredId === circle.id;
                  return (
                    <button
                      key={circle.id}
                      onClick={() => onSelectCircle(circle.id)}
                      onMouseEnter={() => setHoveredId(circle.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="text-left rounded-2xl p-5 border-2 transition-all duration-200 flex flex-col gap-3 group"
                      style={{
                        backgroundColor: isHovered ? pal.bg : '#ffffff',
                        borderColor: isHovered ? pal.border : '#e7e5e4',
                        transform: isHovered ? 'translateY(-2px)' : 'none',
                        boxShadow: isHovered ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* Pod icon + name */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                          style={{ backgroundColor: pal.bg, color: pal.text, border: `2px solid ${pal.border}` }}>
                          {getInitials(circle.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-stone-900 truncate text-sm">{circle.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pal.dot }} />
                            <span className="text-[10px] text-stone-400 font-medium">Member</span>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">{circle.description}</p>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <MemberRings count={circle.members.length} />
                        <span className="flex items-center gap-1 text-xs font-semibold transition-colors"
                          style={{ color: pal.text }}>
                          Open <ArrowRight size={11} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Discover pods ── */}
          {otherPods.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users size={14} className="text-stone-400" />
                <h2 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Discover</h2>
                <span className="text-xs bg-stone-100 text-stone-500 rounded-full px-2 py-0.5">{otherPods.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherPods.map(circle => {
                  const pal = getPalette(circle.name);
                  const isHovered = hoveredId === circle.id;
                  return (
                    <button
                      key={circle.id}
                      onClick={() => onSelectCircle(circle.id)}
                      onMouseEnter={() => setHoveredId(circle.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="text-left rounded-2xl p-5 border transition-all duration-200 flex flex-col gap-3"
                      style={{
                        backgroundColor: isHovered ? pal.bg : '#fafaf9',
                        borderColor: isHovered ? pal.border : '#e7e5e4',
                        transform: isHovered ? 'translateY(-2px)' : 'none',
                        boxShadow: isHovered ? '0 8px 24px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                          style={{ backgroundColor: pal.bg, color: pal.text, border: `1.5px solid ${pal.border}` }}>
                          {getInitials(circle.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-stone-800 truncate text-sm">{circle.name}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">{circle.members.length} member{circle.members.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">{circle.description}</p>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <MemberRings count={circle.members.length} />
                        <span className="flex items-center gap-1 text-xs font-semibold text-stone-400 group-hover:text-stone-600 transition-colors">
                          View <ArrowRight size={11} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Create pod modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => { setIsModalOpen(false); setError(''); setName(''); setDescription(''); }}>
          <div className="bg-white rounded-2xl border p-6 w-full max-w-md shadow-2xl"
            style={{ borderColor: '#e7e5e4' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Start a pod</h2>
                <p className="text-xs text-stone-400 mt-0.5">Build a small intentional community</p>
              </div>
              <button onClick={() => { setIsModalOpen(false); setError(''); setName(''); setDescription(''); }}
                className="text-stone-400 hover:text-stone-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 p-2.5 rounded-xl">{error}</p>
              )}
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Pod name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-stone-400 bg-white placeholder:text-stone-400"
                  placeholder="e.g. Fintech Builders, Career Changers 30+"
                  disabled={isCreating} />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">What's it about?</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-stone-400 bg-white placeholder:text-stone-400 resize-none"
                  rows={3}
                  placeholder="Who should join this pod, and why?"
                  disabled={isCreating} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button"
                  onClick={() => { setIsModalOpen(false); setError(''); setName(''); setDescription(''); }}
                  className="flex-1 py-2.5 border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-colors text-sm font-semibold"
                  disabled={isCreating}>
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 text-white font-bold rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1a4a3a' }}
                  disabled={isCreating}>
                  {isCreating ? 'Creating…' : 'Create pod'}
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
