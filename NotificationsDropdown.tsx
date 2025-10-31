import React from 'react';
import { Notification, ConnectionRequest, User } from '../types';
import { BriefcaseIcon, MessageSquareIcon, ThumbUpIcon, UsersIcon, ShieldCheckIcon } from '../constants';

interface NotificationsDropdownProps {
  notifications: Notification[];
  connectionRequests: ConnectionRequest[];
  users: User[];
  onAcceptConnection: (requestId: number) => void;
  onDeclineConnection: (requestId: number) => void;
}

const NotificationIcon: React.FC<{type: Notification['type']}> = ({ type }) => {
    const iconClass = "w-6 h-6";
    switch(type) {
        case 'MESSAGE': return <MessageSquareIcon className={`${iconClass} text-green-500`}/>;
        case 'ENDORSEMENT': return <ThumbUpIcon className={`${iconClass} text-cyan-400`} />;
        case 'CONNECTION_REQUEST': return <UsersIcon className={`${iconClass} text-purple-400`} />;
        case 'CONNECTION_ACCEPTED': return <UsersIcon className={`${iconClass} text-purple-400`} />;
        case 'SECURITY_ALERT': return <ShieldCheckIcon className={`${iconClass} text-yellow-400`} />;
        default: return <BriefcaseIcon className={iconClass} />;
    }
}

const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({ notifications, connectionRequests, users, onAcceptConnection, onDeclineConnection }) => {
  const pendingConnectionRequests = notifications
    .filter(n => n.type === 'CONNECTION_REQUEST' && n.relatedId)
    .map(n => connectionRequests.find(cr => cr.id === n.relatedId && cr.status === 'pending'))
    .filter(Boolean) as ConnectionRequest[];

  return (
    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-800 rounded-xl shadow-lg border border-slate-700 max-h-[70vh] flex flex-col">
      <div className="p-3 border-b border-slate-700">
        <h3 className="font-semibold text-slate-200">Notifications</h3>
      </div>
      <div className="overflow-y-auto">
        {pendingConnectionRequests.length > 0 && (
            <div className="p-3 border-b border-slate-700">
                <h4 className="text-sm font-semibold text-slate-400 mb-2">Connection Requests</h4>
                {pendingConnectionRequests.map(req => {
                    const fromUser = users.find(u => u.id === req.fromUserId);
                    if (!fromUser) return null;
                    return (
                        <div key={req.id} className="p-2 rounded-md bg-slate-700/50">
                            <div className="flex items-center space-x-3">
                               <img src={fromUser.avatarUrl} alt={fromUser.name} className="w-10 h-10 rounded-full" />
                               <div>
                                  <p className="text-sm text-slate-300"><span className="font-bold text-slate-100">{fromUser.name}</span> wants to connect.</p>
                                  <p className="text-xs text-slate-400">{fromUser.headline}</p>
                               </div>
                            </div>
                            <div className="flex justify-end space-x-2 mt-2">
                                <button onClick={() => onDeclineConnection(req.id)} className="text-xs font-semibold text-slate-300 px-3 py-1 rounded-full hover:bg-slate-600">Decline</button>
                                <button onClick={() => onAcceptConnection(req.id)} className="text-xs font-semibold text-cyan-400 border border-cyan-400 px-3 py-1 rounded-full hover:bg-cyan-900/50">Accept</button>
                            </div>
                        </div>
                    )
                })}
            </div>
        )}
        
        {notifications.length === 0 ? (
          <p className="text-center text-slate-400 p-4">No new notifications.</p>
        ) : (
          <ul className="divide-y divide-slate-700">
            {notifications.slice().reverse().map(notification => (
              <li key={notification.id} className={`p-3 flex items-start space-x-3 hover:bg-slate-700/50 ${!notification.read ? 'bg-cyan-900/20' : ''}`}>
                 <div className="flex-shrink-0 mt-1">
                    <NotificationIcon type={notification.type} />
                 </div>
                 <div>
                    <p className="text-sm text-slate-300">{notification.text}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{notification.timestamp}</p>
                 </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NotificationsDropdown;