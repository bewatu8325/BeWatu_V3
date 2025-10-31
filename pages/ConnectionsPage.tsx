import React from 'react';
import { useConnections } from '../hooks/useMockData';
// FIX: Correctly import Connection type which is now defined in types.ts
import type { Connection } from '../types';

const ConnectionCard: React.FC<{ connection: Connection }> = ({ connection }) => (
  <div className="bg-white rounded-lg shadow-md text-center p-6 transition-transform transform hover:-translate-y-1">
    <img src={connection.avatarUrl} alt={connection.name} className="w-24 h-24 mx-auto rounded-full mb-4" />
    <h3 className="font-semibold text-lg text-gray-800">{connection.name}</h3>
    <p className="text-sm text-gray-600">{connection.headline}</p>
    <button className="mt-4 w-full py-2 px-4 border border-blue-600 text-blue-600 font-semibold rounded-full hover:bg-blue-50 transition-colors">
      Message
    </button>
  </div>
);


const ConnectionsPage: React.FC = () => {
  const { connections } = useConnections();

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-4">My Network ({connections.length})</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {connections.map(connection => (
          <ConnectionCard key={connection.id} connection={connection} />
        ))}
      </div>
    </div>
  );
};

export default ConnectionsPage;