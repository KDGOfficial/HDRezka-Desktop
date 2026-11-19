import { create } from 'zustand';
import { UserSettings, MirrorStatus } from '../../shared/types';
import { DEFAULT_USER_SETTINGS } from '../../shared/constants';

interface SettingsState {
  settings: UserSettings;
  mirrorsStatus: MirrorStatus[];
  isCheckingMirrors: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  checkMirrors: () => Promise<void>;
  setActiveMirror: (mirror: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_USER_SETTINGS,
  mirrorsStatus: [],
  isCheckingMirrors: false,

  loadSettings: async () => {
    if (window.api) {
      try {
        const s = await window.api.getSettings();
        set({ settings: s });
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
  },

  updateSettings: async (newSettings) => {
    if (window.api) {
      try {
        const saved = await window.api.saveSettings(newSettings);
        set({ settings: saved });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }
  },

  checkMirrors: async () => {
    if (window.api) {
      set({ isCheckingMirrors: true });
      try {
        const statuses = await window.api.checkMirrors();
        set({ mirrorsStatus: statuses, isCheckingMirrors: false });
      } catch (err) {
        console.error('Failed to check mirrors:', err);
        set({ isCheckingMirrors: false });
      }
    }
  },

  setActiveMirror: async (mirror) => {
    if (window.api) {
      try {
        await window.api.setActiveMirror(mirror);
        set((state) => ({
          settings: {
            ...state.settings,
            app: {
              ...state.settings.app,
              activeMirror: mirror,
            },
          },
        }));
      } catch (err) {
        console.error('Failed to set active mirror:', err);
      }
    }
  },
}));
