import { create } from 'zustand';

export interface ToastNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationState {
  notifications: ToastNotification[];
  notify: (notification: Omit<ToastNotification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  notify: (notification) => {
    const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    const item: ToastNotification = { id, ...notification };
    set((state) => ({ notifications: [...state.notifications, item] }));

    const duration = notification.duration ?? 4000;
    setTimeout(() => {
      set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
    }, duration);
  },
  removeNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
}));
