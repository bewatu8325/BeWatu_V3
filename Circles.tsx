import React from 'react';
import { Circle } from '../types';
import { CirclesIcon, UsersIcon } from '../constants';

interface CirclesProps {
  circles: Circle[];
  onSelectCircle: (circleId: number) => void;
}

const Circles: React.FC<CirclesProps> = ({ circles, onSelectCircle }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <CirclesIcon className="w-8 h-8 text-purple-400" />
        <h1 className="text-3xl font-bold text-slate-100">Discover Circles</h1>
      </div>
      <p className="text-slate-400">Join micro-communities to collaborate, co-learn, and connect with professionals in your domain.</p>
      
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
                    <UsersIcon className="w-4 h-4"/>
                    <span>{circle.members.length} members</span>
                </div>
                <button className="font-semibold text-cyan-400 hover:text-cyan-300">
                    View Circle &rarr;
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Circles;