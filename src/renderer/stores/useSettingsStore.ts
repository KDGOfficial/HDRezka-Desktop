import { create } from 'zustand';
import { UserSettings, MirrorStatus, UpdateInfo, UpdateProgress, ContentType, UserInterestsProfile } from '../../shared/types';
import { DEFAULT_USER_SETTINGS, ANIME_MIRROR_SEEDS } from '../../shared/constants';
import {
  InteractionKind,
  createEmptyInterestsProfile,
  normalizeInterestsProfile,
  recordTasteInteraction,
} from '../../shared/recommendations';

interface SettingsState {
  settings: UserSettings;
  settingsLoaded: boolean;
  mirrorsStatus: MirrorStatus[];
  isCheckingMirrors: boolean;
  isFindingMirrors: boolean;
  verificationEpoch: number;

  // Auto-Update State
  updateInfo: UpdateInfo | null;
  isCheckingUpdate: boolean;
  updateProgress: UpdateProgress | null;
  isUpdateModalOpen: boolean;
  updateScheduledOnExit: boolean;

  // Adaptive Interests Modal
  isInterestsModalOpen: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  setInterestsModalOpen: (open: boolean) => void;
  saveUserInterests: (favoriteGenres: string[], favoriteTypes: ContentType[], completed?: boolean) => Promise<void>;
  recordTasteSignal: (
    item: { id?: string; genres?: string[]; url?: string; info?: string; type?: ContentType },
    kind: InteractionKind
  ) => void;
  resetUserInterests: () => Promise<void>;
  checkMirrors: () => Promise<void>;
  findOnlineMirrors: () => Promise<number>;
  verifyMirror: (targetUrl?: string) => Promise<boolean>;
  setActiveMirror: (mirror: string) => Promise<void>;
  removeCustomMirror: (mirror: string) => Promise<void>;

  checkForUpdates: (notifyIfAvailable?: boolean) => Promise<UpdateInfo | null>;
  downloadUpdate: (scheduleOnExitAfter?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  scheduleUpdateOnExit: (enabled?: boolean) => Promise<boolean>;
  setUpdateModalOpen: (open: boolean) => void;
}

const recentSignalKeys = new Map<string, number>();

function getInitialTheme(): UserSettings['theme'] {
  try {
    const saved = localStorage.getItem('color-scheme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return DEFAULT_USER_SETTINGS.theme;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_USER_SETTINGS, theme: getInitialTheme() },
  settingsLoaded: false,
  mirrorsStatus: [],
  isCheckingMirrors: false,
  isFindingMirrors: false,
  verificationEpoch: 0,

  updateInfo: null,
  isCheckingUpdate: false,
  updateProgress: null,
  isUpdateModalOpen: false,
  updateScheduledOnExit: false,
  isInterestsModalOpen: false,

  loadSettings: async () => {
    if (window.api) {
      try {
        const s = await window.api.getSettings();
        set({ settings: s, settingsLoaded: true });

        // Check updates silently on start; download in background & install on exit instead of interrupting startup
        if (s.app?.checkUpdatesOnStart) {
          get()
            .checkForUpdates(false)
            .then((info) => {
              if (info?.hasUpdate && info.assetUrl) {
                get().downloadUpdate(true);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        set({ settingsLoaded: true });
      }
    } else {
      set({ settingsLoaded: true });
    }
  },

  updateSettings: async (newSettings) => {
    if (typeof window !== 'undefined' && typeof window.api?.saveSettings === 'function') {
      try {
        const saved = await window.api.saveSettings(newSettings);
        set({ settings: saved });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    } else {
      set((state) => ({
        settings: { ...state.settings, ...newSettings },
      }));
    }
  },

  setInterestsModalOpen: (open: boolean) => set({ isInterestsModalOpen: open }),

  saveUserInterests: async (favoriteGenres, favoriteTypes, completed = true) => {
    const current = normalizeInterestsProfile(get().settings.interests);
    const nextFavGenres = Array.from(new Set(favoriteGenres.filter(Boolean)));
    const nextFavSet = new Set(nextFavGenres);
    const now = Date.now();

    // Gently dampen learned scores for genres the user explicitly unchecked so shifting tastes take effect faster
    const nextGenreScores = { ...current.genreScores };
    for (const prevFav of current.favoriteGenres) {
      if (!nextFavSet.has(prevFav) && nextGenreScores[prevFav]) {
        const damped = Number((nextGenreScores[prevFav].weight * 0.35).toFixed(3));
        if (damped < 0.08) delete nextGenreScores[prevFav];
        else nextGenreScores[prevFav] = { weight: damped, updatedAt: now };
      }
    }

    const nextInterests: UserInterestsProfile = {
      ...current,
      onboardingCompleted: completed,
      favoriteGenres: nextFavGenres,
      favoriteTypes: Array.from(new Set(favoriteTypes)),
      genreScores: nextGenreScores,
      updatedAt: now,
    };
    await get().updateSettings({ interests: nextInterests });
  },

  recordTasteSignal: (item, kind) => {
    const dedupeKey = `${kind}:${item.id || item.url || ''}`;
    const now = Date.now();
    const lastTs = recentSignalKeys.get(dedupeKey);
    // Avoid double-counting the same title within 10 minutes
    if (item.id && lastTs && now - lastTs < 10 * 60 * 1000) return;
    if (item.id) recentSignalKeys.set(dedupeKey, now);

    const nextInterests = recordTasteInteraction(get().settings.interests, item, kind, now);
    get().updateSettings({ interests: nextInterests });
  },

  resetUserInterests: async () => {
    const resetProfile: UserInterestsProfile = {
      ...createEmptyInterestsProfile(),
      onboardingCompleted: true,
      updatedAt: Date.now(),
    };
    recentSignalKeys.clear();
    await get().updateSettings({ interests: resetProfile });
  },

  checkMirrors: async () => {
    if (window.api) {
      set({ isCheckingMirrors: true });
      try {
        const statuses = await window.api.checkMirrors();
        const s = await window.api.getSettings();
        const allowed = new Set([...(s.app?.mirrors || []), ...ANIME_MIRROR_SEEDS]);
        const visibleStatuses = allowed.size > 0 ? statuses.filter((st: MirrorStatus) => allowed.has(st.url)) : statuses;
        set({ settings: s, mirrorsStatus: visibleStatuses, isCheckingMirrors: false });
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
      await get().checkMirrors();
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

  downloadUpdate: async (scheduleOnExitAfter = false) => {
    if (!window.api) return;
    const { updateInfo, updateProgress } = get();
    if (!updateInfo) return;
    if (updateProgress?.status === 'downloading') return;
    if (updateProgress?.status === 'ready') {
      if (scheduleOnExitAfter) {
        await get().scheduleUpdateOnExit(true);
      }
      return;
    }

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
        if (scheduleOnExitAfter) {
          await get().scheduleUpdateOnExit(true);
        }
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
    const unsubscribe = window.api.onUpdateProgress((progress) => {
      set({ updateProgress: progress });
    });
    try {
      const ok = await window.api.installUpdate();
      if (!ok && get().updateProgress?.status === 'installing') {
        set({
          updateProgress: {
            percent: 0,
            transferredBytes: 0,
            totalBytes: 0,
            status: 'error',
            error: 'Не удалось запустить установщик обновления. Скачайте релиз вручную на GitHub.',
          },
        });
      }
    } catch (err: any) {
      console.error('Failed to install update:', err);
      set({
        updateProgress: {
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'error',
          error: err?.message || 'Failed to launch installer',
        },
      });
    } finally {
      unsubscribe();
    }
  },

  scheduleUpdateOnExit: async (enabled = true) => {
    if (!window.api?.scheduleUpdateOnExit) return false;
    try {
      const scheduled = await window.api.scheduleUpdateOnExit(enabled);
      set({ updateScheduledOnExit: scheduled });
      return scheduled;
    } catch (err) {
      console.error('Failed to schedule update on exit:', err);
      return false;
    }
  },

  setUpdateModalOpen: (open: boolean) => {
    set({ isUpdateModalOpen: open });
  },
}));
