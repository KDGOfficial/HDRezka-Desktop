import { create } from 'zustand';
import { UserSettings, MirrorStatus, UpdateInfo, UpdateProgress } from '../../shared/types';
import { DEFAULT_USER_SETTINGS } from '../../shared/constants';

interface SettingsState {
  settings: UserSettings;
  mirrorsStatus: MirrorStatus[];
  isCheckingMirrors: boolean;
  isFindingMirrors: boolean;
  verificationEpoch: number;

  // Auto-Update State
  updateInfo: UpdateInfo | null;
  isCheckingUpdate: boolean;
  updateProgress: UpdateProgress | null;
  isUpdateModalOpen: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  checkMirrors: () => Promise<void>;
  findOnlineMirrors: () => Promise<number>;
  verifyMirror: (targetUrl?: string) => Promise<boolean>;
  setActiveMirror: (mirror: string) => Promise<void>;
  removeCustomMirror: (mirror: string) => Promise<void>;

  checkForUpdates: (notifyIfAvailable?: boolean) => Promise<UpdateInfo | null>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setUpdateModalOpen: (open: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_USER_SETTINGS,
  mirrorsStatus: [],
  isCheckingMirrors: false,
  isFindingMirrors: false,
  verificationEpoch: 0,

  updateInfo: null,
  isCheckingUpdate: false,
  updateProgress: null,
  isUpdateModalOpen: false,

  loadSettings: async () => {
    if (window.api) {
      try {
        const s = await window.api.getSettings();
        set({ settings: s });

        // Auto check updates on start if enabled
        if (s.app?.checkUpdatesOnStart) {
          get().checkForUpdates(true);
        }
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

  findOnlineMirrors: async () => {
    if (!window.api) return 0;
    set({ isFindingMirrors: true });
    try {
      const res = await window.api.findOnlineMirrors();
      const s = await window.api.getSettings();
      set({ settings: s, isFindingMirrors: false });
      // Refresh mirrors status ping
      get().checkMirrors();
      return res.added.length;
    } catch (err) {
      console.error('Failed to find online mirrors:', err);
      set({ isFindingMirrors: false });
      return 0;
    }
  },

  verifyMirror: async (targetUrl?: string) => {
    if (!window.api?.verifyMirror) return false;
    try {
      const ok = await window.api.verifyMirror(targetUrl);
      const s = await window.api.getSettings();
      set((state) => ({ settings: s, verificationEpoch: state.verificationEpoch + 1 }));
      await get().checkMirrors();
      return ok;
    } catch (err) {
      console.error('Failed to verify mirror:', err);
      return false;
    }
  },

  removeCustomMirror: async (mirror: string) => {
    if (!window.api) return;
    const { settings } = get();
    const mirrors = settings.app?.mirrors || [];
    const updatedMirrors = mirrors.filter((m) => m !== mirror);
    let activeMirror = settings.app?.activeMirror;
    if (activeMirror === mirror) {
      activeMirror = updatedMirrors[0] || 'https://hdrezka-home.tv';
    }
    await get().updateSettings({
      app: {
        ...settings.app,
        mirrors: updatedMirrors,
        activeMirror,
      },
    });
    set((state) => ({
      mirrorsStatus: state.mirrorsStatus.filter((m) => m.url !== mirror),
    }));
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

  checkForUpdates: async (notifyIfAvailable = false) => {
    if (!window.api) return null;
    set({ isCheckingUpdate: true });
    try {
      const info = await window.api.checkForUpdates();
      set({
        updateInfo: info,
        isCheckingUpdate: false,
        isUpdateModalOpen: notifyIfAvailable && info.hasUpdate,
      });
      return info;
    } catch (err) {
      console.error('Failed to check for updates:', err);
      set({ isCheckingUpdate: false });
      return null;
    }
  },

  downloadUpdate: async () => {
    if (!window.api) return;
    const { updateInfo } = get();
    if (!updateInfo) return;

    set({
      updateProgress: {
        percent: 0,
        transferredBytes: 0,
        totalBytes: updateInfo.assetSize || 0,
        status: 'downloading',
      },
    });

    const unsubscribe = window.api.onUpdateProgress((progress) => {
      set({ updateProgress: progress });
    });

    try {
      const res = await window.api.downloadUpdate(updateInfo.assetUrl);
      if (res.openedInBrowser) {
        set({
          updateProgress: {
            percent: 100,
            transferredBytes: 0,
            totalBytes: 0,
            status: 'opened_in_browser',
            error: res.error,
          },
        });
        return;
      }
      if (res.success) {
        set((state) => ({
          updateProgress: {
            percent: 100,
            transferredBytes: state.updateProgress?.totalBytes || updateInfo.assetSize || 0,
            totalBytes: state.updateProgress?.totalBytes || updateInfo.assetSize || 0,
            status: 'ready',
            filePath: res.filePath,
          },
        }));
      } else {
        set({
          updateProgress: {
            percent: 0,
            transferredBytes: 0,
            totalBytes: 0,
            status: 'error',
            error: res.error || 'Download failed',
          },
        });
      }
    } catch (err: any) {
      set({
        updateProgress: {
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'error',
          error: err?.message || 'Download failed',
        },
      });
    } finally {
      unsubscribe();
    }
  },

  installUpdate: async () => {
    if (!window.api) return;
    set({
      updateProgress: {
        percent: 100,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'installing',
      },
    });
    try {
      await window.api.installUpdate();
    } catch (err) {
      console.error('Failed to install update:', err);
    }
  },

  setUpdateModalOpen: (open: boolean) => {
    set({ isUpdateModalOpen: open });
  },
}));
