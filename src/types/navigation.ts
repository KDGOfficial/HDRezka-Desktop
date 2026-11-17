export type NavTab = 
  | 'home'
  | 'catalog'
  | 'movies'
  | 'series'
  | 'cartoons'
  | 'anime'
  | 'collections'
  | 'favorites'
  | 'continue'
  | 'history'
  | 'settings'
  | 'search';

export interface ViewState {
  currentTab: NavTab;
  selectedMediaId: string | null;
  selectedMediaUrl: string | null;
  isPlaying: boolean;
}
