import React from 'react';
import { useNotificationStore } from '../../stores/notificationStore';
import { Info, CheckCircle, AlertTriangle, AlertCircle, X } from 'lucide-react';

export const NotificationsContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
      {notifications.map((n) => {
        let Icon = Info;
        let borderClass = 'border-blue-500/30';
        let iconClass = 'text-blue-400';

        if (n.type === 'success') {
          Icon = CheckCircle;
          borderClass = 'border-emerald-500/30';
          iconClass = 'text-emerald-400';
        } else if (n.type === 'warning') {
          Icon = AlertTriangle;
          borderClass = 'border-amber-500/30';
          iconClass = 'text-amber-400';
        } else if (n.type === 'error') {
          Icon = AlertCircle;
          borderClass = 'border-red-500/30';
          iconClass = 'text-red-400';
        }

        return (
          <div
            key={n.id}
            className={`pointer-events-auto bg-[#17181D]/95 backdrop-blur-md border ${borderClass} p-3.5 rounded-xl shadow-2xl flex items-start space-x-3 transition-all duration-300 animate-slide-in`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconClass}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white">{n.title}</div>
              {n.message && (
                <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed break-words">
                  {n.message}
                </div>
              )}
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-zinc-500 hover:text-white p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
