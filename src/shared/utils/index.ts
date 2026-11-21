export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days === 1) return 'Вчера';
  if (days < 30) return `${days} дн. назад`;
  return formatDate(timestamp);
}

export function getRatingColor(rating?: number): string {
  if (!rating || rating <= 0) return 'text-zinc-300 bg-black/75 border border-white/15';
  if (rating >= 8.0) return 'text-[#FFB830] bg-[#160D09]/85 border border-[#FFB830]/40';
  if (rating >= 6.5) return 'text-emerald-300 bg-[#0B1712]/85 border border-emerald-400/35';
  if (rating >= 5.0) return 'text-amber-300 bg-[#1A130A]/85 border border-amber-400/35';
  return 'text-rose-300 bg-[#1B0C12]/85 border border-rose-400/35';
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: any = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}
