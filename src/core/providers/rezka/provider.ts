

import * as cheerio from 'cheerio';
import { IProvider } from '../types';
import {
  MediaItem,
  MediaDetails,
  CatalogFilter,
  SearchResult,
  StreamData,
  Season,
  MirrorStatus,
  ContentType,
  Translator,
  VideoQualityStream,
  SubtitleTrack,
} from '../../../shared/types';
import { DEFAULT_MIRRORS, isBadMirrorUrl, BROWSER_USER_AGENT } from '../../../shared/constants';
import { parseStreamData } from './decoder';
import {
  FALLBACK_HERO,
  FALLBACK_ITEMS,
  FALLBACK_HOME_SECTIONS,
  getFallbackDetails,
} from './fallbackData';

export async function clearStaleAnubisCookies(targetUrlOrHost?: string): Promise<void> {
  let electron: any;
  try { electron = require('electron'); } catch (_) {}
  if (!electron?.session?.defaultSession?.cookies) return;

  let targetHost = '';
  if (targetUrlOrHost) {
    try {
      targetHost = targetUrlOrHost.startsWith('http')
        ? new URL(targetUrlOrHost).hostname.toLowerCase()
        : targetUrlOrHost.replace(/^www\./, '').toLowerCase();
    } catch (_) {
      targetHost = targetUrlOrHost.toLowerCase();
    }
  }

  try {
    const allCookies = await electron.session.defaultSession.cookies.get({}).catch(() => []);
    for (const c of allCookies) {
      const name = c.name.toLowerCase();
      if (
        name.includes('anubis') ||
        name.includes('cookie-verification') ||
        name.includes('cf_clearance') ||
        name.includes('_vc_id') ||
        name.includes('challenge')
      ) {
        const domain = (c.domain?.startsWith('.') ? c.domain.slice(1) : (c.domain || 'rezka.ag')).toLowerCase();
        if (
          targetHost &&
          domain !== targetHost &&
          !targetHost.endsWith('.' + domain) &&
          !domain.endsWith('.' + targetHost)
        ) {
          continue;
        }
        for (const u of [`https://${domain}${c.path || '/'}`, `http://${domain}${c.path || '/'}`]) {
          await electron.session.defaultSession.cookies.remove(u, c.name).catch(() => {});
        }
      }
    }
  } catch (_) {}
}

async function appFetch(input: string | URL | Request, init?: RequestInit & { skipCookies?: boolean }): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : (input as any).url || input.toString();
  let electron: any;
  try {
    electron = require('electron');
  } catch (_) {}

  const makeReq = async (forceSkipCookies = false) => {
    if (electron && electron.net && typeof electron.net.fetch === 'function') {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('User-Agent')) {
        headers.set('User-Agent', BROWSER_USER_AGENT);
      }

      const credentialsMode = (init?.skipCookies || forceSkipCookies) ? 'omit' : 'include';
      return await electron.net.fetch(input as any, { ...init, headers, credentials: credentialsMode });
    }
    return await globalThis.fetch(input, init);
  };

  const res = await makeReq();

  // If server returns HTTP 500 (stale / poisoned auth cookie crash), immediately purge host cookies and retry clean
  if (res.status === 500 && !init?.skipCookies) {
    await clearStaleAnubisCookies(urlStr);
    try {
      const cleanRes = await makeReq(true);
      if (cleanRes.ok || cleanRes.status === 403) {
        return cleanRes;
      }
    } catch (_) {}
  }

  return res;
}

export class RezkaProvider implements IProvider {
  public id = 'hdrezka';
  public name = 'HDRezka Provider';
  public version = '0.0.35';

  private activeMirror: string;
  private mirrors: string[];
  private timeoutMs: number;
  private mediaCache: Map<string, Partial<MediaItem>> = new Map();
  private mediaUrlCache: Map<string, string> = new Map();
  private kinobasePlayerCache: Map<
    string,
    {
      ts: number;
      file: any;
      subtitle?: string;
      trailerUrl?: string;
      balancerSrc?: string;
      kpId?: string;
    }
  > = new Map();

  constructor(activeMirror = 'https://rezka.ag', mirrors = DEFAULT_MIRRORS, timeoutMs = 8000) {
    this.mirrors = [...mirrors].filter((m) => !isBadMirrorUrl(m));
    if (!activeMirror || isBadMirrorUrl(activeMirror)) {
      activeMirror = this.mirrors[0] || 'https://rezka.ag';
    }
    this.activeMirror = activeMirror;
    this.timeoutMs = timeoutMs;
  }

  private isAntiBot(html: string): boolean {
    if (!html) return false;
    return (
      html.includes('anubis_challenge') ||
      html.includes('Проверяем, что вы не бот') ||
      html.includes('cf-browser-verification') ||
      html.includes('challenge-running') ||
      html.includes('Attention Required! | Cloudflare') ||
      html.includes('b-antibot') ||
      html.includes('within.website') ||
      html.includes('Время сессии истекло')
    );
  }

  public getActiveMirror(): string {
    return this.activeMirror;
  }

  public setActiveMirror(mirror: string): void {
    this.activeMirror = mirror.replace(/\/$/, '');
  }

  public getMirrors(): string[] {
    return [...this.mirrors];
  }

  public setMirrors(mirrors: string[]): void {
    this.mirrors = [...mirrors];
  }

  private getHeaders(referer?: string): Record<string, string> {
    return {
      'User-Agent': BROWSER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      ...(referer ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      'Referer': referer || this.activeMirror,
    };
  }

  private async fetchHtml(url: string, retries = 2): Promise<string> {
    let lastError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await appFetch(url, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = await res.text();
        return html;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
    }
    throw new Error(`Failed to fetch ${url}: ${lastError?.message}`);
  }

  public async checkMirrors(mirrorsToCheck?: string[]): Promise<MirrorStatus[]> {
    const list = mirrorsToCheck && mirrorsToCheck.length > 0 ? mirrorsToCheck : this.mirrors;

    return Promise.all(
      list.map(async (mirror): Promise<MirrorStatus> => {
        const cleanUrl = mirror.replace(/\/$/, '');
        if (isBadMirrorUrl(cleanUrl)) {
          return {
            url: cleanUrl,
            isAvailable: false,
            latencyMs: 9999,
            lastChecked: Date.now(),
            needsVerification: false,
          };
        }

        const rootT0 = Date.now();
        try {
          const rootRes = await appFetch(cleanUrl, {
            headers: this.getHeaders(cleanUrl),
            signal: AbortSignal.timeout(5000),
          });
          const latency = Date.now() - rootT0;
          const text = await rootRes.text();
          const isBlocked = this.isAntiBot(text);
          const hasRezkaContent =
            text.includes('b-content') ||
            text.includes('b-post') ||
            text.includes('b-top') ||
            text.includes('kinobase') ||
            text.includes('Кинобейс');
          const isFakeLogin = text.includes('Вход на HDrezka') || (text.includes('card-face') && !hasRezkaContent);
          const isLiveRezka = (hasRezkaContent || isBlocked) && !isFakeLogin;
          const isLiveSite = isLiveRezka && text.length > 200;
          const isAvail = (rootRes.ok || rootRes.status === 403) && isLiveSite;
          return {
            url: cleanUrl,
            isAvailable: isAvail,
            latencyMs: isAvail ? latency : 9999,
            lastChecked: Date.now(),
            needsVerification: isAvail && isBlocked && !hasRezkaContent,
          };
        } catch {
          return {
            url: cleanUrl,
            isAvailable: false,
            latencyMs: 9999,
            lastChecked: Date.now(),
            needsVerification: false,
          };
        }
      })
    );
  }

  public async selectBestMirror(): Promise<string> {
    if (isBadMirrorUrl(this.activeMirror)) {
      this.activeMirror = this.mirrors[0] || 'https://rezka.ag';
    }

    const statuses = await this.checkMirrors();

    // Preserve active mirror if it's currently available and does not require bot verification
    const activeStatus = statuses.find(s => s.url === this.activeMirror);
    if (activeStatus && activeStatus.isAvailable && !activeStatus.needsVerification) {
      return this.activeMirror;
    }

    const available = statuses.filter(s => s.isAvailable);
    if (available.length > 0) {
      available.sort((a, b) => {
        if (a.needsVerification !== b.needsVerification) {
          return a.needsVerification ? 1 : -1;
        }
        return a.latencyMs - b.latencyMs;
      });
      // If active mirror is available and shares best verification status with lowest latency, retain it
      if (activeStatus && activeStatus.isAvailable && activeStatus.needsVerification === available[0].needsVerification) {
        return this.activeMirror;
      }
      this.activeMirror = available[0].url;
      return this.activeMirror;
    }

    return this.activeMirror;
  }

  public async findOnlineMirrors(): Promise<{ added: string[]; all: string[] }> {
    const candidateUrls = new Set<string>();

    // Seed list of known mirror candidates (excluding dead/hangup domains)
    const seeds = [
      'https://rezka.ag',
      'https://hdrezka.me',
      'https://hdrezka.club',
      'https://rezka-tv.org',
      'https://hdrezka.sh',
      'https://rezka.pub',
      'https://hdrezka.kim',
      'https://hdrezka-home.tv',
      'https://rezka-ua.org',
    ];
    for (const s of seeds) {
      if (!isBadMirrorUrl(s)) candidateUrls.add(s);
    }

    // Online sources
    const sources = [
      'https://raw.githubusercontent.com/MrIkso/hdrezka-fetcher/master/mirror.txt',
      'https://raw.githubusercontent.com/thecapibara/RDX-TV/main/src/services/api.ts',
      'https://raw.githubusercontent.com/thecapibara/RDX/main/src/services/api.ts',
      'https://t.me/s/HDRezkaPC',
    ];

    await Promise.allSettled(
      sources.map(async (src) => {
        try {
          const res = await appFetch(src, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HDRezka-Desktop' },
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok) {
            const text = await res.text();
            const matches = text.match(/https?:\/\/[a-zA-Z0-9.-]*(rezka|hdrezka)[a-zA-Z0-9.-]*/gi) || [];
            for (const m of matches) {
              const clean = m.trim().replace(/\/$/, '');
              if (/^https?:\/\/[a-zA-Z0-9.-]+$/i.test(clean) && !clean.includes('t.me') && !clean.includes('github')) {
                candidateUrls.add(clean);
              }
            }
          }
        } catch {}
      })
    );

    // Test candidates in parallel
    const verifiedNewMirrors: string[] = [];
    const currentSet = new Set(this.mirrors.map(m => m.toLowerCase().replace(/\/$/, '')));

    const candidatesList = Array.from(candidateUrls).filter(c => !isBadMirrorUrl(c) && !currentSet.has(c.toLowerCase()));

    await Promise.allSettled(
      candidatesList.map(async (url) => {
        try {
          const res = await appFetch(url, {
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(4500),
          });
          const text = await res.text();
          const isAlive = (res.ok || res.status === 403) && (
            this.isAntiBot(text) ||
            text.includes('b-content') ||
            /rezka/i.test(text)
          );
          if (isAlive) {
            verifiedNewMirrors.push(url);
          }
        } catch {}
      })
    );

    // PRESERVE ALL EXISTING USER MIRRORS - ONLY APPEND NEW UNIQUE WORKING MIRRORS
    if (verifiedNewMirrors.length > 0) {
      this.mirrors = [...this.mirrors, ...verifiedNewMirrors];
    }

    return {
      added: verifiedNewMirrors,
      all: [...this.mirrors],
    };
  }

  private parseItem(element: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): MediaItem | null {
    const el = $(element);
    const id = el.attr('data-id') || '';
    if (!id) return null;

    const linkEl = el.find('.b-content__inline_item-link a');
    const url = linkEl.attr('href') || el.attr('data-url') || '';
    const title = linkEl.text().trim();
    if (!title) return null;

    const imgEl = el.find('.b-content__inline_item-cover img');
    const poster = imgEl.attr('src') || '';

    const catEl = el.find('.cat');
    let type: ContentType = 'films';
    if (catEl.hasClass('series') || url.includes('/series/')) type = 'series';
    else if (catEl.hasClass('cartoons') || url.includes('/cartoons/')) type = 'cartoons';
    else if (catEl.hasClass('animation') || url.includes('/animation/')) type = 'animation';
    else if (catEl.hasClass('show') || url.includes('/show/')) type = 'shows';

    const infoText = el.find('.misc').text().trim() || el.find('.b-content__inline_item-link div').text().trim();
    const badgeText = el.find('.info').text().trim();

    // Extract year, country, genres from infoText "2024, США, Боевики"
    let year: number | undefined;
    let country: string | undefined;
    const genres: string[] = [];

    if (infoText) {
      const parts = infoText.split(',').map(p => p.trim());
      const yearMatch = parts[0]?.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) year = parseInt(yearMatch[1], 10);
      if (parts.length > 1) country = parts[1];
      if (parts.length > 2) {
        for (let i = 2; i < parts.length; i++) {
          genres.push(parts[i]);
        }
      }
    }

    const ratingEl = el.find('.rating i');
    const rating = ratingEl.length ? parseFloat(ratingEl.text().trim()) : undefined;

    return {
      id,
      title,
      url,
      poster,
      year,
      country,
      genres,
      type,
      rating,
      info: badgeText || infoText,
    };
  }

  private async fetchItemsFromPath(path: string): Promise<MediaItem[]> {
    try {
      const url = path.startsWith('http') ? path : `${this.activeMirror}${path}`;
      const html = await this.fetchHtml(url);
      if (this.isAntiBot(html)) return [];
      const $ = cheerio.load(html);
      const items: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item && !items.some((x) => x.id === item.id)) {
          this.mediaCache.set(item.url, item);
          this.mediaCache.set(item.id, item);
          items.push(item);
        }
      });
      return items;
    } catch {
      return [];
    }
  }

  private async fetchLiveRezkaHomeSections() {
    try {
      // Live HDRezka category searches directly from search endpoint
      const queries = ['лучшие', 'фильмы', 'сериалы', 'новинки', 'мультфильмы'];
      const queryResults = await Promise.allSettled(queries.map((q) => this.searchAdvanced(q, 1)));

      let recommendations: MediaItem[] = [];
      let popular: MediaItem[] = [];
      let newReleases: MediaItem[] = [];
      let topMovies: MediaItem[] = [];
      let topSeries: MediaItem[] = [];
      const allLiveMap = new Map<string, MediaItem>();

      queryResults.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.items)) {
          const items = res.value.items;
          items.forEach((it) => {
            if (it.url && !allLiveMap.has(it.url)) {
              allLiveMap.set(it.url, it);
            }
          });
          const q = queries[idx];
          if (q === 'лучшие') {
            recommendations = items.slice(0, 16);
          } else if (q === 'новинки') {
            newReleases = items.slice(0, 16);
            popular = items.slice(0, 16);
          } else if (q === 'сериалы') {
            topSeries = items.slice(0, 16);
          } else if (q === 'фильмы') {
            topMovies = items.slice(0, 16);
          } else if (q === 'мультфильмы' && recommendations.length < 8) {
            recommendations.push(...items.slice(0, 8));
          }
        }
      });

      const allLive = Array.from(allLiveMap.values());
      if (allLive.length === 0) {
        return FALLBACK_HOME_SECTIONS;
      }

      // Pick hero with valid poster and high prominence
      const heroCandidate =
        recommendations.find((i) => i.poster && !i.poster.includes('unsplash')) ||
        popular.find((i) => i.poster && !i.poster.includes('unsplash')) ||
        allLive.find((i) => i.poster && !i.poster.includes('unsplash')) ||
        allLive[0];

      if (recommendations.length === 0) {
        recommendations = allLive.filter((i) => (i.rating || 0) >= 7.0 || i.poster?.includes('static.hdrezka')).slice(0, 16);
      }
      if (popular.length === 0) {
        popular = allLive.slice(0, 16);
      }
      if (newReleases.length === 0) {
        newReleases = allLive.filter((i) => (i.year || 0) >= 2024).slice(0, 16);
      }
      if (topMovies.length === 0) {
        topMovies = allLive.filter((i) => i.type === 'films').slice(0, 16);
      }
      if (topSeries.length === 0) {
        topSeries = allLive.filter((i) => i.type === 'series').slice(0, 16);
      }

      const expected = allLive.filter((i) => (i.year || 0) >= 2025).slice(0, 16);

      return {
        hero: heroCandidate || FALLBACK_HERO,
        popular: popular.length > 0 ? popular : FALLBACK_HOME_SECTIONS.popular,
        newReleases: newReleases.length > 0 ? newReleases : FALLBACK_HOME_SECTIONS.newReleases,
        topMovies: topMovies.length > 0 ? topMovies : FALLBACK_HOME_SECTIONS.topMovies,
        topSeries: topSeries.length > 0 ? topSeries : FALLBACK_HOME_SECTIONS.topSeries,
        recommendations: recommendations.length > 0 ? recommendations : (popular.length > 0 ? popular : FALLBACK_HOME_SECTIONS.recommendations),
        expected: expected.length > 0 ? expected : FALLBACK_HOME_SECTIONS.expected,
      };
    } catch {
      return FALLBACK_HOME_SECTIONS;
    }
  }

  private isKinobase(urlOrMirror?: string): boolean {
    const target = (urlOrMirror || this.activeMirror || '').toLowerCase();
    return target.includes('kinobase.org') || target.startsWith('/film/') || target.startsWith('/serial/');
  }

  private parseKinobaseItems(html: string, defaultType: ContentType = 'films'): MediaItem[] {
    const $ = cheerio.load(html);
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    $('li.item, div.item').each((_, el) => {
      const linkEl = $(el).find('.title a, .poster a, a').first();
      const href = linkEl.attr('href') || '';
      const rawTitle = $(el).find('.title a').text().trim() || linkEl.attr('title') || linkEl.text().trim();
      if (!href || !rawTitle || !/\/(?:film|serial)\/\d+/.test(href)) return;

      const idMatch = href.match(/\/(?:film|serial)\/(\d+)/);
      const id = idMatch ? idMatch[1] : href;
      if (seen.has(id)) return;
      seen.add(id);

      const fullUrl = href.startsWith('http')
        ? href
        : `https://kinobase.org${href.startsWith('/') ? '' : '/'}${href}`;
      const img = $(el).find('img').first();
      let poster = img.attr('data-src') || img.attr('src') || '';
      if (poster && !poster.startsWith('http')) {
        poster = `https://kinobase.org${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      const yearText = $(el).find('.year').text().trim();
      const yMatch = yearText.match(/\b(19\d{2}|20\d{2})\b/) || rawTitle.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yMatch ? parseInt(yMatch[1], 10) : undefined;
      const rText = $(el).find('.rating').first().text().trim();
      const rating = rText ? parseFloat(rText) : undefined;
      const labelText = $(el).find('.label').text().trim();

      let type: ContentType = defaultType;
      if (href.includes('/serial/')) type = 'series';
      else if (defaultType === 'films' && href.includes('/film/')) type = 'films';

      const item: MediaItem = {
        id,
        title: title || rawTitle,
        url: fullUrl,
        poster,
        year,
        type,
        rating: rating && !isNaN(rating) ? rating : undefined,
        info: labelText || yearText || undefined,
      };
      this.mediaCache.set(fullUrl, item);
      this.mediaCache.set(href, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, fullUrl);
      items.push(item);
    });
    return items;
  }

  private async fetchKinobasePage(url: string, timeoutMs = 5000): Promise<{ html: string; cookies: string } | null> {
    try {
      const res = await appFetch(url, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const html = await res.text();
      if (!html || this.isAntiBot(html)) return null;
      const setCookies = (res.headers as any).getSetCookie
        ? (res.headers as any).getSetCookie()
        : [res.headers.get('set-cookie')];
      const cookies = (setCookies || [])
        .filter(Boolean)
        .map((c: string) => c.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');
      return { html, cookies };
    } catch {
      return null;
    }
  }

  private async getKinobaseHomeSections() {
    try {
      const [homePage, filmsPage, serialsPage, animPage] = await Promise.all([
        this.fetchKinobasePage('https://kinobase.org/'),
        this.fetchKinobasePage('https://kinobase.org/films?sort=rating'),
        this.fetchKinobasePage('https://kinobase.org/serials'),
        this.fetchKinobasePage('https://kinobase.org/animation'),
      ]);

      const homeItems = homePage ? this.parseKinobaseItems(homePage.html) : [];
      const filmsItems = filmsPage ? this.parseKinobaseItems(filmsPage.html, 'films') : [];
      const seriesItems = serialsPage ? this.parseKinobaseItems(serialsPage.html, 'series') : [];
      const animItems = animPage ? this.parseKinobaseItems(animPage.html, 'animation') : [];

      if (homeItems.length === 0 && filmsItems.length === 0 && seriesItems.length === 0) {
        return null;
      }

      const popular = (homeItems.length > 0 ? homeItems : filmsItems).slice(0, 16);
      const newReleasesList = homeItems.filter((i) => (i.year || 0) >= 2024);
      const newReleases = (newReleasesList.length > 0 ? newReleasesList : homeItems.slice(16, 32)).slice(0, 16);
      const topMovies = (filmsItems.length > 0 ? filmsItems : homeItems.filter((i) => i.type === 'films')).slice(0, 16);
      const topSeries = (seriesItems.length > 0 ? seriesItems : homeItems.filter((i) => i.type === 'series')).slice(0, 16);
      const recommendations = [...filmsItems.slice(0, 8), ...animItems.slice(0, 8)];
      const expectedList = homeItems.filter((i) => (i.year || 0) >= 2025);
      const expected = (expectedList.length > 0 ? expectedList : homeItems).slice(0, 16);
      const hero = topMovies[0] || popular[0] || topSeries[0];

      return {
        hero,
        popular,
        newReleases: newReleases.length > 0 ? newReleases : popular,
        topMovies: topMovies.length > 0 ? topMovies : popular,
        topSeries: topSeries.length > 0 ? topSeries : popular,
        recommendations: recommendations.length > 0 ? recommendations : popular,
        expected,
      };
    } catch {
      return null;
    }
  }

  private async getKinobaseCatalog(filter: CatalogFilter): Promise<SearchResult | null> {
    try {
      const routeMap: Record<ContentType, string> = {
        films: '/films',
        series: '/serials',
        cartoons: '/animation',
        animation: '/animation',
        shows: '/tv',
      };
      const baseRoute = routeMap[filter.type] || '/films';
      const params = new URLSearchParams();
      if (filter.sort === 'popular' || filter.sort === 'rating') {
        params.set('sort', 'rating');
      }
      if (filter.page > 1) {
        params.set('page', String(filter.page));
      }
      const qs = params.toString();
      const targetUrl = `https://kinobase.org${baseRoute}${qs ? `?${qs}` : ''}`;
      const page = await this.fetchKinobasePage(targetUrl);
      if (!page) return null;

      const items = this.parseKinobaseItems(page.html, filter.type);
      if (items.length === 0) return null;

      const hasMore = page.html.includes(`page=${filter.page + 1}`) || page.html.includes('pagination');
      return {
        items,
        page: filter.page,
        hasMore,
      };
    } catch {
      return null;
    }
  }

  private async searchKinobase(query: string): Promise<MediaItem[]> {
    const cleanQ = query.trim();
    if (!cleanQ) return [];
    const page = await this.fetchKinobasePage(`https://kinobase.org/search?query=${encodeURIComponent(cleanQ)}`, 4000);
    if (!page) return [];
    return this.parseKinobaseItems(page.html);
  }

  public parseKinobaseFileString(
    fileStr: string,
    preferredTranslatorId?: number
  ): {
    translators: Translator[];
    streamsByTranslator: Map<number, VideoQualityStream[]>;
    defaultStreams: VideoQualityStream[];
  } {
    const translators: Translator[] = [];
    const translatorIdsByName = new Map<string, number>();
    const streamsByTranslator = new Map<number, VideoQualityStream[]>();

    if (!fileStr || typeof fileStr !== 'string') {
      return { translators, streamsByTranslator, defaultStreams: [] };
    }

    const qualityBlocks = Array.from(fileStr.matchAll(/\[([^\]]+)\]([^[]*)/g));
    for (const block of qualityBlocks) {
      const quality = block[1].trim();
      const body = block[2].replace(/,\s*$/, '').trim();
      if (!quality || !body) continue;

      const variants = body.split(';').map((v) => v.trim()).filter(Boolean);
      for (const variant of variants) {
        const voiceMatch = variant.match(/^\{([^}]+)\}([\s\S]+)$/);
        const voiceName = voiceMatch ? voiceMatch[1].trim() : 'Оригинал / Дубляж';
        const urlsPart = voiceMatch ? voiceMatch[2].trim() : variant;
        const urls = urlsPart
          .split(/\s+or\s+/i)
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\//i.test(u));
        if (urls.length === 0) continue;

        let trId = translatorIdsByName.get(voiceName);
        if (!trId) {
          trId = translators.length + 1;
          translatorIdsByName.set(voiceName, trId);
          translators.push({ id: trId, name: voiceName, premium: false });
        }

        const list = streamsByTranslator.get(trId) || [];
        if (!list.some((s) => s.quality === quality)) {
          list.push({ quality, hls: urls[0], mp4: urls[0] });
          streamsByTranslator.set(trId, list);
        }
      }
    }

    const qualityRank = (q: string) => parseInt(q.replace(/[^\d]/g, ''), 10) || 0;
    for (const [trId, list] of streamsByTranslator.entries()) {
      list.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
      streamsByTranslator.set(trId, list);
    }

    const selectedId =
      (preferredTranslatorId && streamsByTranslator.has(preferredTranslatorId)
        ? preferredTranslatorId
        : translators[0]?.id) || 0;
    const defaultStreams = (selectedId && streamsByTranslator.get(selectedId)) || [];

    return { translators, streamsByTranslator, defaultStreams };
  }

  private parseKinobaseSubtitles(rawSubtitle?: string): SubtitleTrack[] {
    if (!rawSubtitle || typeof rawSubtitle !== 'string') return [];
    const tracks: SubtitleTrack[] = [];
    for (const block of rawSubtitle.matchAll(/\[([^\]]+)\]([^[]*)/g)) {
      const language = block[1].trim();
      const urlsPart = block[2].replace(/,\s*$/, '').trim();
      const firstUrl = urlsPart
        .split(/\s+or\s+/i)
        .map((u) => u.trim())
        .find((u) => /^https?:\/\//i.test(u));
      if (language && firstUrl) {
        tracks.push({ language, url: firstUrl });
      }
    }
    return tracks;
  }

  private parseKinobaseSeriesAndTranslators(
    rawFile: any,
    rawSubtitle?: string
  ): {
    translators: Translator[];
    seasons?: Season[];
    getEpisodeStreams: (translatorId?: number, seasonId?: number, episodeId?: number) => VideoQualityStream[];
    subtitles: SubtitleTrack[];
  } {
    const subtitles = this.parseKinobaseSubtitles(rawSubtitle);
    let parsed: any = rawFile;
    if (typeof rawFile === 'string') {
      const trimmed = rawFile.trim();
      if (trimmed.startsWith('[') && !/^\[\d+p/i.test(trimmed)) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = rawFile;
        }
      }
    }

    if (typeof parsed === 'string') {
      const movieParsed = this.parseKinobaseFileString(parsed);
      return {
        translators: movieParsed.translators,
        seasons: undefined,
        subtitles,
        getEpisodeStreams: (translatorId?: number) => {
          if (translatorId && movieParsed.streamsByTranslator.has(translatorId)) {
            return movieParsed.streamsByTranslator.get(translatorId)!;
          }
          return movieParsed.defaultStreams;
        },
      };
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return {
        translators: [],
        seasons: undefined,
        subtitles,
        getEpisodeStreams: () => [],
      };
    }

    const seasons: Season[] = [];
    const episodeFiles = new Map<string, string>();
    const hasSeasonFolders = parsed.some((s: any) => Array.isArray(s?.folder));

    if (hasSeasonFolders) {
      parsed.forEach((s: any, sIdx: number) => {
        const seasonTitle = s?.title || `Сезон ${sIdx + 1}`;
        const seasonNumMatch = String(seasonTitle).match(/\d+/);
        const seasonId = seasonNumMatch ? parseInt(seasonNumMatch[0], 10) : sIdx + 1;
        const episodes = Array.isArray(s?.folder)
          ? s.folder.map((ep: any, epIdx: number) => {
              const epTitle = ep?.title || `Серия ${epIdx + 1}`;
              const epId = epIdx + 1;
              if (ep?.file) episodeFiles.set(`${seasonId}_${epId}`, String(ep.file));
              return { id: epId, episodeId: epId, seasonId, title: epTitle };
            })
          : [];
        if (episodes.length > 0) {
          seasons.push({ id: seasonId, title: seasonTitle, episodes });
        }
      });
    } else {
      const episodes = parsed.map((ep: any, epIdx: number) => {
        const epId = epIdx + 1;
        const epTitle = ep?.title || `Серия ${epId}`;
        if (ep?.file) episodeFiles.set(`1_${epId}`, String(ep.file));
        return { id: epId, episodeId: epId, seasonId: 1, title: epTitle };
      });
      if (episodes.length > 0) {
        seasons.push({ id: 1, title: 'Сезон 1', episodes });
      }
    }

    const sampleFile = episodeFiles.values().next().value || '';
    const sampleParsed = this.parseKinobaseFileString(sampleFile);

    return {
      translators: sampleParsed.translators,
      seasons: seasons.length > 0 ? seasons : undefined,
      subtitles,
      getEpisodeStreams: (translatorId?: number, seasonId?: number, episodeId?: number) => {
        const targetKey = `${seasonId || seasons[0]?.id || 1}_${episodeId || 1}`;
        const epFile = episodeFiles.get(targetKey) || sampleFile;
        if (!epFile) return [];
        return this.parseKinobaseFileString(epFile, translatorId).defaultStreams;
      },
    };
  }

  private async extractKinobasePlayerData(
    filmUrl: string,
    preloadedHtml?: string,
    preloadedCookies?: string
  ): Promise<{
    file: any;
    subtitle?: string;
    trailerUrl?: string;
    balancerSrc?: string;
    kpId?: string;
  } | null> {
    const cached = this.kinobasePlayerCache.get(filmUrl);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return cached;
    }

    let html = preloadedHtml || '';
    let cookies = preloadedCookies || '';
    if (!html) {
      const page = await this.fetchKinobasePage(filmUrl, 5000);
      if (!page) return null;
      html = page.html;
      cookies = page.cookies;
    }

    const trailerMatch = html.match(/MOVIE_TRAILER\s*=\s*["']([^"']+)["']/i);
    const trailerUrl = trailerMatch ? trailerMatch[1] : undefined;
    const kpMatch = html.match(/kinopoisk\.ru\/film\/(\d+)/i);
    const kpId = kpMatch ? kpMatch[1] : undefined;
    const $ = cheerio.load(html);
    const balancerSrc = $('#tab-options a[href="#online2"]').attr('data-balancer-src') || undefined;

    let file: any = null;
    let subtitle: string | undefined;

    try {
      const inlineVars = $('script')
        .map((_, el) => $(el).html() || '')
        .get()
        .find((s) => s.includes('MOVIE_URL'));
      const hsPathMatch = html.match(/\/static\/js\/hs\.js\?v=\d+/);
      if (inlineVars && hsPathMatch) {
        const hsRes = await appFetch(`https://kinobase.org${hsPathMatch[0]}`, {
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            'Referer': filmUrl,
            ...(cookies ? { Cookie: cookies } : {}),
          },
          signal: AbortSignal.timeout(4500),
        });
        if (hsRes.ok) {
          const hsCode = await hsRes.text();
          const vmMod = (process as any).getBuiltinModule?.('vm') || (0, eval)('require')('vm');
          let readyFn: (() => void) | null = null;
          const ajaxCalls: any[] = [];
          const fakeEl: any = new Proxy(
            {
              ready: (fn: () => void) => {
                readyFn = fn;
                return fakeEl;
              },
              width: () => 800,
              height: () => 450,
            },
            { get: (t, p) => (p in t ? t[p] : () => fakeEl) }
          );
          const fakeJq: any = (sel: any) => {
            if (typeof sel === 'function') {
              readyFn = sel;
              return fakeEl;
            }
            return fakeEl;
          };
          fakeJq.fn = { jquery: '3.0.0', rating: () => {} };
          fakeJq.extend = Object.assign;
          fakeJq.ajax = (opts: any) => {
            ajaxCalls.push(opts);
          };
          fakeJq.get = () => ({ done: () => {}, fail: () => {}, always: () => {} });
          fakeJq.post = () => ({ done: () => {}, fail: () => {}, always: () => {} });

          let playerConfig: any = null;
          const parsedUrl = new URL(filmUrl);
          const sandbox: any = {
            document: {
              cookie: cookies,
              getElementsByTagName: () => [{ innerHTML: 'kinobase.org', href: 'https://kinobase.org' }],
              querySelectorAll: () => [{ innerHTML: 'kinobase.org', href: 'https://kinobase.org' }],
              getElementById: () => null,
              querySelector: () => null,
            },
            location: { hostname: 'kinobase.org', href: filmUrl, pathname: parsedUrl.pathname },
            screen: { width: 1920, height: 1080 },
            localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            navigator: { userAgent: BROWSER_USER_AGENT },
            $: fakeJq,
            jQuery: fakeJq,
            Playerjs: function (cfg: any) {
              playerConfig = cfg;
            },
            Uppod: function (cfg: any) {
              playerConfig = cfg;
            },
            atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
            btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
            setTimeout: () => {},
            Image: function () {},
            PLAYER_TYPE: 'new',
            FILE_TYPE: 'hls',
            ENABLE_HDR: '0',
            CURRENT_USER_ID: 0,
          };
          vmMod.createContext(sandbox);
          vmMod.runInContext('window = globalThis; global = globalThis;', sandbox);
          vmMod.runInContext(inlineVars, sandbox);
          vmMod.runInContext(hsCode, sandbox);
          if (readyFn) (readyFn as () => void)();

          if (ajaxCalls[0]?.url) {
            const u1 =
              'https://kinobase.org' +
              ajaxCalls[0].url +
              '?' +
              new URLSearchParams(ajaxCalls[0].data || {}).toString();
            const r1 = await appFetch(u1, {
              headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Referer': filmUrl,
                ...(cookies ? { Cookie: cookies } : {}),
              },
              signal: AbortSignal.timeout(4000),
            });
            if (r1.ok) {
              ajaxCalls[0].success?.(await r1.text());
              if (ajaxCalls[1]?.url) {
                const u2 =
                  'https://kinobase.org' +
                  ajaxCalls[1].url +
                  '?' +
                  new URLSearchParams(ajaxCalls[1].data || {}).toString();
                const r2 = await appFetch(u2, {
                  headers: {
                    'User-Agent': BROWSER_USER_AGENT,
                    'Referer': filmUrl,
                    ...(cookies ? { Cookie: cookies } : {}),
                  },
                  signal: AbortSignal.timeout(4000),
                });
                if (r2.ok) {
                  ajaxCalls[1].success?.(await r2.text());
                }
              }
            }
          }

          if (playerConfig?.file) {
            file = playerConfig.file;
            subtitle = playerConfig.subtitle;
          }
        }
      }
    } catch (_) {}

    const entry = {
      ts: Date.now(),
      file,
      subtitle,
      trailerUrl,
      balancerSrc,
      kpId,
    };
    this.kinobasePlayerCache.set(filmUrl, entry);
    return entry;
  }

  private async extractBalancerStream(balancerSrc: string, episode?: number): Promise<StreamData | null> {
    try {
      const movieId = new URL(balancerSrc).searchParams.get('movie_id');
      if (!movieId) return null;
      const br = await appFetch(balancerSrc, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Referer': 'https://kinobase.org/' },
        signal: AbortSignal.timeout(4500),
      });
      if (!br.ok) return null;
      const bh = await br.text();
      const hdrMatch = bh.match(/window\.REQUEST_HEADERS\s*=\s*(\{[^}]+\})/);
      const baseMatch = bh.match(/window\.ENV_BASE_URL\s*=\s*'([^']+)'/);
      if (!hdrMatch || !baseMatch) return null;

      const reqHeaders = JSON.parse(hdrMatch[1].replace(/'/g, '"'));
      const baseUrl = baseMatch[1];
      const apiHeaders = {
        ...reqHeaders,
        'X-Has-Token': 'true',
        'X-Parent-Referrer': 'https://kinobase.org/',
        'User-Agent': BROWSER_USER_AGENT,
        'Referer': balancerSrc,
      };
      const er = await appFetch(`${baseUrl}/catalog-api/episodes?content-id=${movieId}`, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(4500),
      });
      if (!er.ok) return null;
      const eJson: any[] = await er.json();
      if (!Array.isArray(eJson) || eJson.length === 0) return null;

      const epIdx = episode && episode > 0 && eJson[episode - 1] ? episode - 1 : 0;
      const filepath = eJson[epIdx]?.episodeVariants?.[0]?.filepath;
      if (!filepath) return null;

      let finalM3u8 = filepath;
      try {
        const mr = await appFetch(filepath, {
          headers: { 'User-Agent': BROWSER_USER_AGENT, 'Referer': balancerSrc },
          signal: AbortSignal.timeout(4500),
        });
        if (mr.ok && mr.url) {
          finalM3u8 = mr.url;
        }
      } catch (_) {}

      return {
        streams: [
          { quality: '1080p', hls: finalM3u8, mp4: finalM3u8 },
          { quality: '720p', hls: finalM3u8, mp4: finalM3u8 },
          { quality: '480p', hls: finalM3u8, mp4: finalM3u8 },
        ],
        subtitles: [],
        isAlternative: true,
        sourceName: 'Kinobase Balancer',
      };
    } catch {
      return null;
    }
  }

  private async resolveKinobaseUrl(urlOrId: string, meta?: Partial<MediaItem>): Promise<string | null> {
    const normId = urlOrId.split('/').pop()?.split('-')[0] || urlOrId;
    const candidates = [urlOrId, meta?.url, this.mediaUrlCache.get(normId)];
    for (const c of candidates) {
      if (c && this.isKinobase(c)) {
        return c.startsWith('http') ? c : `https://kinobase.org${c.startsWith('/') ? '' : '/'}${c}`;
      }
    }

    const rawTitle = meta?.title || meta?.origTitle || '';
    const query = rawTitle.split('/')[0].replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    if (!query) return null;

    const results = await this.searchKinobase(query);
    if (results.length === 0) return null;
    if (meta?.year) {
      const exactYear = results.find((r) => r.year === meta.year);
      if (exactYear) return exactYear.url;
    }
    return results[0].url;
  }

  private async getKinobaseDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails | null> {
    try {
      const filmUrl = await this.resolveKinobaseUrl(urlOrId, meta);
      if (!filmUrl) return null;

      const page = await this.fetchKinobasePage(filmUrl, 5000);
      if (!page) return null;

      const $ = cheerio.load(page.html);
      let ld: any = {};
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($(el).html() || '{}');
          if (parsed && (parsed.name || parsed.description)) ld = parsed;
        } catch {}
      });

      const idMatch = filmUrl.match(/\/(?:film|serial)\/(\d+)/);
      const id = idMatch ? idMatch[1] : meta?.id || urlOrId;
      this.mediaUrlCache.set(id, filmUrl);

      const title = $('#title h1').first().text().trim() || ld.name || meta?.title || '';
      if (!title) return null;

      let poster = $('#media .poster img').first().attr('src') || ld.image || meta?.poster || '';
      if (poster && !poster.startsWith('http')) {
        poster = `https://kinobase.org${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      let origTitle = meta?.origTitle || '';
      let country = meta?.country || '';
      let ageRating = '';
      let duration = '';
      const genres: string[] = Array.isArray(ld.genre) ? ld.genre : [];
      let year = ld.datePublished ? parseInt(String(ld.datePublished).slice(0, 4), 10) : (meta?.year || 0);

      $('#info .info_item').each((_, el) => {
        const key = $(el).find('.key').text().trim();
        const val = $(el).find('.value').text().trim();
        if (key.includes('Название')) origTitle = val;
        else if (key.includes('Страна')) country = val;
        else if (key.includes('Возраст')) ageRating = val;
        else if (key.includes('Время') || key.includes('Длительность')) duration = val;
        else if (key.includes('Год') && !year) {
          const ym = val.match(/\b(19\d{2}|20\d{2})\b/);
          if (ym) year = parseInt(ym[1], 10);
        }
      });

      const ratingRezka = parseFloat($('#rating_votes .rating_site').parent().text().replace(/[^\d.]/g, '')) || ld.aggregateRating?.ratingValue || meta?.rating;
      const ratingKp = parseFloat($('#rating_votes .rating_kp').parent().text().replace(/[^\d.]/g, '')) || undefined;
      const ratingImdb = parseFloat($('#rating_votes .rating_imdb').parent().text().replace(/[^\d.]/g, '')) || undefined;
      const description = ld.description || $('.description, [itemprop="description"]').text().trim() || '';
      const directors = Array.isArray(ld.director) ? ld.director.map((d: any) => d?.name).filter(Boolean) : [];
      const actors = Array.isArray(ld.actor) ? ld.actor.map((a: any) => a?.name).filter(Boolean) : [];

      let type: ContentType = meta?.type || 'films';
      if (filmUrl.includes('/serial/') || page.html.includes('MOVIE_TYPE = "serials"')) type = 'series';
      else if (page.html.includes('MOVIE_TYPE = "animation"')) type = 'animation';

      const playerData = await this.extractKinobasePlayerData(filmUrl, page.html, page.cookies);
      const parsedMedia = playerData?.file
        ? this.parseKinobaseSeriesAndTranslators(playerData.file, playerData.subtitle)
        : { translators: [], seasons: undefined };

      const translators: Translator[] =
        parsedMedia.translators.length > 0
          ? parsedMedia.translators
          : [{ id: 1, name: 'Дубляж / Оригинал', premium: false }];

      return {
        id,
        title,
        origTitle,
        poster,
        backdrop: poster,
        year,
        country,
        genres,
        type,
        duration,
        ageRating,
        ratingRezka: ratingRezka && !isNaN(ratingRezka) ? ratingRezka : undefined,
        ratingImdb: ratingImdb && !isNaN(ratingImdb) ? ratingImdb : undefined,
        ratingKp: ratingKp && !isNaN(ratingKp) ? ratingKp : undefined,
        description,
        directors,
        actors,
        translators,
        currentTranslatorId: translators[0]?.id ?? 1,
        seasons: parsedMedia.seasons,
        similar: [],
        antiBot: false,
      };
    } catch {
      return null;
    }
  }

  public async getHomeSections() {
    if (this.isKinobase()) {
      const kHome = await this.getKinobaseHomeSections();
      if (kHome) return kHome;
      return FALLBACK_HOME_SECTIONS;
    }
    try {
      const html = await this.fetchHtml(this.activeMirror);
      if (this.isAntiBot(html)) {
        console.warn('[RezkaProvider] Active mirror protected by anti-bot. Trying Kinobase / search fallback.');
        const kHome = await this.getKinobaseHomeSections();
        if (kHome) return kHome;
        return await this.fetchLiveRezkaHomeSections();
      }
      const $ = cheerio.load(html);

      const allItems: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item && !allItems.some((x) => x.id === item.id)) {
          this.mediaCache.set(item.url, item);
          this.mediaCache.set(item.id, item);
          allItems.push(item);
        }
      });

      if (allItems.length === 0) {
        console.warn('[RezkaProvider] Parsed 0 items from mirror. Trying Kinobase / search fallback.');
        const kHome = await this.getKinobaseHomeSections();
        if (kHome) return kHome;
        return await this.fetchLiveRezkaHomeSections();
      }

      // Fetch categories & recommendations directly from HDRezka in parallel
      const [recsDirect, popularDirect, newDirect, moviesDirect, seriesDirect] = await Promise.all([
        this.fetchItemsFromPath('/best/'),
        this.fetchItemsFromPath('/?filter=popular'),
        this.fetchItemsFromPath('/new/'),
        this.fetchItemsFromPath('/films/best/'),
        this.fetchItemsFromPath('/series/best/'),
      ]);

      const recommendations = recsDirect.length > 0
        ? recsDirect
        : allItems.filter((i) => (i.rating || 0) >= 7.0 || i.type === 'cartoons');

      const popular = popularDirect.length > 0
        ? popularDirect
        : allItems.slice(0, 16);

      const newReleases = newDirect.length > 0
        ? newDirect
        : allItems.slice(16, 32);

      const topMovies = moviesDirect.length > 0
        ? moviesDirect
        : allItems.filter((i) => i.type === 'films');

      const topSeries = seriesDirect.length > 0
        ? seriesDirect
        : allItems.filter((i) => i.type === 'series');

      const expected = allItems.filter((i) => (i.year || 0) >= 2025).length > 0
        ? allItems.filter((i) => (i.year || 0) >= 2025).slice(0, 16)
        : allItems.slice(32, 48);

      // Hero: pick top item from recommendations or popular
      let hero = recommendations[0] || popular[0] || allItems[0];
      if (hero?.url) {
        const cached = this.mediaCache.get(hero.url);
        if (cached?.info) {
          hero = { ...hero, info: cached.info };
        }
      }

      return {
        hero,
        popular: popular.slice(0, 16),
        newReleases: newReleases.slice(0, 16),
        topMovies: topMovies.slice(0, 16),
        topSeries: topSeries.slice(0, 16),
        recommendations: recommendations.slice(0, 16),
        expected: expected.slice(0, 16),
      };
    } catch (err) {
      console.warn('[RezkaProvider] Error fetching home sections, trying Kinobase / live search:', err);
      const kHome = await this.getKinobaseHomeSections();
      if (kHome) return kHome;
      return await this.fetchLiveRezkaHomeSections();
    }
  }

  public async getCatalog(filter: CatalogFilter) {
    if (this.isKinobase()) {
      const kCat = await this.getKinobaseCatalog(filter);
      if (kCat) return kCat;
    }
    try {
      const catSlug = filter.type === 'shows' ? 'show' : filter.type;
      let path = `/${catSlug}/`;
      if (filter.genre) {
        path += `${filter.genre}/`;
      }
      if (filter.sort === 'popular') {
        path += 'best/';
      } else if (filter.sort === 'watching') {
        path += 'watching/';
      }

      if (filter.year) {
        path += `${filter.year}/`;
      }

      if (filter.page > 1) {
        path += `page/${filter.page}/`;
      }

      const targetUrl = `${this.activeMirror}${path}`;
      const html = await this.fetchHtml(targetUrl);
      if (this.isAntiBot(html)) {
        throw new Error('Anti-bot challenge active');
      }
      const $ = cheerio.load(html);

      const items: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item) items.push(item);
      });

      if (items.length === 0) {
        throw new Error('No items parsed');
      }

      const hasMore = $('.b-navigation__next, a:contains("Вперед"), a:contains("Вперёд")').length > 0;

      return {
        items,
        page: filter.page,
        hasMore,
      };
    } catch (err) {
      const kCat = await this.getKinobaseCatalog(filter);
      if (kCat) return kCat;

      try {
        const queryTerm = filter.genre || (filter.type === 'films' ? 'фильм' : filter.type === 'series' ? 'сериал' : filter.type === 'cartoons' ? 'мультфильм' : 'аниме');
        const liveCatalog = await this.searchAdvanced(queryTerm, filter.page);
        if (liveCatalog.items && liveCatalog.items.length > 0) {
          return liveCatalog;
        }
      } catch {}

      let fallback = FALLBACK_ITEMS.filter((i) => i.type === filter.type);
      if (fallback.length === 0) fallback = FALLBACK_ITEMS;
      if (filter.genre) {
        const gLow = filter.genre.toLowerCase();
        const filtered = fallback.filter((i) => i.genres?.some((g) => g.toLowerCase().includes(gLow)));
        if (filtered.length > 0) fallback = filtered;
      }
      return {
        items: fallback,
        page: filter.page,
        hasMore: false,
      };
    }
  }

  public static readonly POPULAR_TRANSLATORS: Record<number, string> = {
    1: 'Дубляж',
    56: 'HDRezka Studio',
    238: 'LostFilm',
    4: 'Оригинал (+субтитры)',
    111: 'AlexFilm',
    70: 'Кубик в Кубе',
    89: 'NewStudio',
    379: 'Red Head Sound',
    417: 'Flarrow Films',
    53: 'BaibaKo',
    62: 'TVShows',
    30: 'Кураж-Бамбей',
    2: 'Многоголосый закадровый',
    3: 'Двуголосый закадровый',
    5: 'Одноголосый закадровый',
    6: 'Субтитры',
    18: 'Украинский дубляж',
    54: 'Coldfilm',
    80: 'AniDUB',
    84: 'SHIZA Project',
    100: 'AniLibria',
    102: 'AniMedia',
    107: 'AnimeVost',
    110: 'Good People',
    115: 'HamsterStudio',
    145: 'IdeaFilm',
    244: 'RuDub',
    345: 'Невафильм',
    355: 'Пифагор',
    374: 'СВ-Дубль',
    430: 'HDRezka (18+)',
  };

  public async probeTranslators(mediaId: string, isMovie?: boolean, pageUrl?: string): Promise<Translator[]> {
    if (!mediaId) return [];
    const mirrorsToTry = [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror)];
    const primaryMirrors = mirrorsToTry.slice(0, 2);
    const blockedMirrors = new Set<string>();
    const action = isMovie ? 'get_movie' : 'get_episodes';
    const trIds = Object.keys(RezkaProvider.POPULAR_TRANSLATORS).map(Number);

    const checkTr = async (trId: number, act: string): Promise<Translator | null> => {
      for (const mirror of primaryMirrors) {
        if (blockedMirrors.has(mirror)) continue;
        try {
          const formData = new URLSearchParams();
          formData.append('id', mediaId);
          formData.append('translator_id', trId.toString());
          formData.append('action', act);

          const res = await appFetch(`${mirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': pageUrl?.replace(/^https?:\/\/[^/]+/, mirror) || `${mirror}/`,
              'User-Agent': BROWSER_USER_AGENT,
            },
            body: formData.toString(),
            signal: AbortSignal.timeout(2500),
          });

          if (!res.ok) continue;
          const text = await res.text();
          if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
            if (this.isAntiBot(text)) {
              blockedMirrors.add(mirror);
            }
            continue;
          }
          const json = JSON.parse(text);
          if (json && json.success) {
            return {
              id: trId,
              name: RezkaProvider.POPULAR_TRANSLATORS[trId] || `Перевод #${trId}`,
              premium: false,
            };
          }
        } catch (_) {}
      }
      return null;
    };

    const results: Translator[] = [];
    const chunkSize = 6;
    for (let i = 0; i < trIds.length; i += chunkSize) {
      if (blockedMirrors.size >= primaryMirrors.length) break;
      const chunk = trIds.slice(i, i + chunkSize);
      const chunkRes = await Promise.all(chunk.map((id) => checkTr(id, action)));
      for (const item of chunkRes) {
        if (item) results.push(item);
      }
    }

    if (results.length === 0 && blockedMirrors.size < primaryMirrors.length) {
      const altAction = isMovie ? 'get_episodes' : 'get_movie';
      for (let i = 0; i < trIds.length; i += chunkSize) {
        if (blockedMirrors.size >= primaryMirrors.length) break;
        const chunk = trIds.slice(i, i + chunkSize);
        const chunkRes = await Promise.all(chunk.map((id) => checkTr(id, altAction)));
        for (const item of chunkRes) {
          if (item) results.push(item);
        }
      }
    }

    return results;
  }

  public async getDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails> {
    const normId = urlOrId.split('/').pop()?.split('-')[0] || urlOrId;
    let cachedMeta = meta || this.mediaCache.get(urlOrId) || this.mediaCache.get(normId);

    if (!cachedMeta) {
      for (const item of this.mediaCache.values()) {
        if (item.url === urlOrId || item.id === normId || (normId && item.url?.includes(`/${normId}-`))) {
          cachedMeta = item;
          break;
        }
      }
    }

    if (this.isKinobase(urlOrId) || this.isKinobase(cachedMeta?.url) || this.isKinobase()) {
      const kd = await this.getKinobaseDetails(urlOrId, cachedMeta);
      if (kd) return kd;
    }

    try {
      let targetUrl = cachedMeta?.url || urlOrId;
      if (!targetUrl.includes('.html')) {
        const cachedCanonical = this.mediaUrlCache.get(normId);
        if (cachedCanonical && cachedCanonical.includes('.html')) {
          targetUrl = cachedCanonical;
        } else {
          for (const item of this.mediaCache.values()) {
            if ((item.id === normId || item.url?.includes(`/${normId}-`)) && item.url?.includes('.html')) {
              targetUrl = item.url;
              break;
            }
          }
        }

        if (!targetUrl.includes('.html')) {
          const rawTitle = cachedMeta?.title || meta?.title || meta?.origTitle || '';
          const query = rawTitle.split('/')[0].replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
          if (query) {
            try {
              const searchResults = await this.searchFast(query);
              const found = searchResults.find(
                (r) => r.id === normId || (normId && r.url?.includes(`/${normId}-`))
              );
              if (found && found.url) {
                targetUrl = found.url;
              }
            } catch {}
          }
        }
      }

      if (!targetUrl.startsWith('http')) {
        targetUrl = targetUrl.startsWith('/') ? `${this.activeMirror}${targetUrl}` : `${this.activeMirror}/${targetUrl}`;
      }
      this.mediaUrlCache.set(normId, targetUrl);
      if (cachedMeta) cachedMeta.url = targetUrl;

      // Extract the path so we can try other mirrors
      let urlPath = '';
      try {
        urlPath = new URL(targetUrl).pathname;
      } catch {
        urlPath = targetUrl.replace(/^https?:\/\/[^/]+/, '');
      }

      // Try active mirror first, then up to 3 backup mirrors in parallel to find one not behind anti-bot
      let html = '';
      try {
        const activeTryUrl = urlPath ? `${this.activeMirror}${urlPath}` : targetUrl;
        html = await this.fetchHtml(activeTryUrl, 0);
      } catch {}

      if (!html || this.isAntiBot(html)) {
        const backupMirrors = this.mirrors.filter((m) => m !== this.activeMirror).slice(0, 3);
        if (backupMirrors.length > 0) {
          const results = await Promise.allSettled(
            backupMirrors.map(async (mirror) => {
              const tryUrl = urlPath ? `${mirror}${urlPath}` : targetUrl;
              const res = await appFetch(tryUrl, {
                headers: this.getHeaders(mirror),
                signal: AbortSignal.timeout(4000),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const body = await res.text();
              if (!body || this.isAntiBot(body)) throw new Error('Anti-bot');
              return body;
            })
          );
          const good = results.find((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled');
          if (good) {
            html = good.value;
          }
        }
      }

      if (this.isAntiBot(html) || !html) {
        const kd = await this.getKinobaseDetails(urlOrId, cachedMeta);
        if (kd) return kd;

        // All mirrors are behind the bot check: probe working translators from AJAX stream endpoint
        const fb = getFallbackDetails(urlOrId, cachedMeta);
        fb.antiBot = true;
        if (fb.id) {
          try {
            const probed = await this.probeTranslators(fb.id, fb.type === 'films', targetUrl);
            if (probed.length > 0) {
              fb.translators = probed;
              const preferred = probed.find((t) => t.id === 1) || probed.find((t) => t.id === 56) || probed[0];
              fb.currentTranslatorId = preferred.id;
              if (fb.type === 'series' || fb.type === 'animation' || fb.type === 'cartoons') {
                const loaded = await this.getSeriesEpisodes(fb.id, fb.currentTranslatorId);
                if (loaded && loaded.length > 0) fb.seasons = loaded;
              }
            }
          } catch {}
        }
        return fb;
      }
      const $ = cheerio.load(html);

      const id = $('#post_id').attr('value') ||
                 $('#send-video-issue').attr('data-id') ||
                 $('#user-favorites-holder').attr('data-post_id') ||
                 normId;

      const title = $('.b-post__title h1, .b-post__title').first().text().trim();
      if (!title) {
        return getFallbackDetails(urlOrId, cachedMeta);
      }
      const origTitle = $('.b-post__origtitle').first().text().trim();
    const poster = $('.b-sidecover img').first().attr('src') || '';
    const backdrop = $('.b-sidecover a').first().attr('href') || poster;
    const description = $('.b-post__description_text').first().text().trim();

    // Parse info table
    let year = 0;
    let country = '';
    let duration = '';
    let ageRating = '';
    const genres: string[] = [];
    const directors: string[] = [];
    const actors: string[] = [];

    $('.b-post__info tr').each((_, row) => {
      const rowText = $(row).text();
      const tdText = $(row).find('td').last().text().trim();

      if (rowText.includes('Дата выхода') || rowText.includes('Год')) {
        const yMatch = tdText.match(/\b(19\d{2}|20\d{2})\b/);
        if (yMatch) year = parseInt(yMatch[1], 10);
      } else if (rowText.includes('Страна')) {
        country = tdText;
      } else if (rowText.includes('Жанр')) {
        $(row).find('td').last().find('a').each((_, a) => {
          genres.push($(a).text().trim());
        });
      } else if (rowText.includes('Время')) {
        duration = tdText;
      } else if (rowText.includes('Возраст')) {
        ageRating = tdText;
      } else if (rowText.includes('Режиссер') || rowText.includes('Режиссёр')) {
        $(row).find('td').last().find('a').each((_, a) => {
          directors.push($(a).text().trim());
        });
      } else if (rowText.includes('В ролях')) {
        $(row).find('td').last().find('a').each((_, a) => {
          actors.push($(a).text().trim());
        });
      }
    });

    // Ratings
    let ratingRezka: number | undefined;
    let ratingImdb: number | undefined;
    let ratingKp: number | undefined;

    $('.b-post__rates .b-post__info_rates').each((_, r) => {
      const text = $(r).text();
      const val = parseFloat($(r).find('.bold').text().trim());
      if (text.includes('IMDb')) ratingImdb = val;
      else if (text.includes('Кинопоиск')) ratingKp = val;
      else ratingRezka = val;
    });

    // Detect type
    const ogType = $('meta[property="og:type"]').attr('content') || '';
    let type: ContentType = 'films';
    if (ogType.includes('tv_series') || targetUrl.includes('/series/')) {
      type = 'series';
    } else if (targetUrl.includes('/cartoons/')) {
      type = 'cartoons';
    } else if (targetUrl.includes('/animation/')) {
      type = 'animation';
    }

    // Translators: the list holds <li> or <a> items depending on the mirror
    const translators: Translator[] = [];
    let currentTranslatorId = 0;
    const translatorSelector = '#translators-list [data-translator_id], .b-translator__list [data-translator_id], .b-translators__list [data-translator_id], [data-translator_id]';
    $(translatorSelector).each((_, el) => {
      const trId = parseInt($(el).attr('data-translator_id') || '0', 10);
      const titleAttr = $(el).attr('title') || '';
      const textAttr = $(el).text() || '';
      let trName = (titleAttr || textAttr).replace(/\s+/g, ' ').trim();
      if (!trName || trName.length < 2) {
        trName = RezkaProvider.POPULAR_TRANSLATORS[trId] || `Перевод #${trId}`;
      }
      if (trId > 0 && !translators.some((t) => t.id === trId)) {
        translators.push({
          id: trId,
          name: trName,
          premium: $(el).hasClass('b-prem_translator'),
          camrip: $(el).attr('data-camrip') === '1',
          ads: $(el).attr('data-ads') === '1',
          director: $(el).attr('data-director') === '1',
        });
        if ($(el).hasClass('active') || $(el).hasClass('current')) currentTranslatorId = trId;
      }
    });

    // Some mirrors render translator choices only in the player's initialization script.
    if (translators.length === 0) {
      const scriptText = $('script').map((_, script) => $(script).html() || '').get().join('\n');
      const translatorIds = new Set<number>();
      for (const match of scriptText.matchAll(/(?:translator_id|translatorId|translator)\s*[=:]\s*["']?(\d+)/gi)) {
        const trId = Number(match[1]);
        if (trId > 0) translatorIds.add(trId);
      }
      for (const trId of translatorIds) {
        translators.push({ id: trId, name: RezkaProvider.POPULAR_TRANSLATORS[trId] || `Перевод #${trId}`, premium: false });
      }
    }

    // The player init script always carries the default translator of the page
    const matchTr = $('script').text().match(/initCDN(?:Series|Movies)Events\(\s*\d+\s*,\s*(\d+)/i);
    const pageTranslatorId = matchTr ? parseInt(matchTr[1], 10) : 0;

    // Single-translator titles have no list, only the "В переводе" info row
    if (translators.length === 0) {
      let singleTrName = '';
      $('.b-post__info tr').each((_, row) => {
        const text = $(row).text();
        if (text.includes('В переводе:') || text.includes('Перевод:')) {
          singleTrName = $(row).find('td').last().text().trim();
        }
      });
      if (singleTrName) {
        translators.push({
          id: pageTranslatorId || 56,
          name: singleTrName,
          premium: false,
        });
      }
    }

    // A single guessed/default translator is not a real choice; discover the available options.
    if (translators.length <= 1 && id) {
      try {
        const probed = await this.probeTranslators(id, type === 'films', targetUrl);
        if (probed.length > 0) {
          translators.length = 0;
          translators.push(...probed);
        }
      } catch {}
    }

    // Final fallback if probing also found nothing
    if (translators.length === 0) {
      translators.push({
        id: (pageTranslatorId !== undefined && pageTranslatorId !== null) ? pageTranslatorId : 0,
        name: 'Оригинал / По умолчанию',
        premium: false,
      });
    }

    if (currentTranslatorId === undefined || currentTranslatorId === null || (currentTranslatorId === 0 && translators.length > 0 && translators[0].id !== 0)) {
      if (pageTranslatorId !== undefined && pageTranslatorId !== null && translators.some((t) => t.id === pageTranslatorId)) {
        currentTranslatorId = pageTranslatorId;
      } else {
        const preferred = translators.find((t) => t.id === 1) || translators.find((t) => t.id === 56) || translators[0];
        currentTranslatorId = preferred ? preferred.id : 0;
      }
    }

    // Similar
    const similar: MediaItem[] = [];
    $('.b-post__partcontent_item, .b-scontent__item').each((_, el) => {
      const sLink = $(el).find('a').first();
      const sUrl = sLink.attr('href') || '';
      const sTitle = $(el).find('.title').text().trim() || sLink.text().trim();
      const sPoster = $(el).find('img').attr('src') || '';
      const sId = sUrl.split('/').pop()?.split('-')[0] || '';
      if (sTitle && sUrl) {
        similar.push({
          id: sId,
          title: sTitle,
          url: sUrl,
          poster: sPoster,
          type,
        });
      }
    });

    // Fetch initial seasons/episodes if TV series or animation
    let seasons: Season[] | undefined;
    const isSeriesLike = type === 'series' || type === 'animation' || type === 'cartoons' || targetUrl.includes('/series/') || targetUrl.includes('/cartoons/');
    if (isSeriesLike) {
      try {
        const loaded = await this.getSeriesEpisodes(id, currentTranslatorId || 56);
        if (loaded && loaded.length > 0) {
          seasons = loaded;
        }
      } catch (e) {
        console.warn('[RezkaProvider] Could not load episodes info:', e);
      }
    }

    return {
      id,
      title,
      origTitle,
      poster,
      backdrop,
      year,
      country,
      genres,
      type,
      duration,
      ageRating,
      ratingRezka,
      ratingImdb,
      ratingKp,
      description,
      directors,
      actors,
      translators,
      currentTranslatorId,
      seasons,
      similar,
      url: targetUrl,
    };
  } catch (err) {
    console.warn('[RezkaProvider] Failed to fetch details, returning fallback:', err);
    const fb = getFallbackDetails(urlOrId, cachedMeta);
    fb.url = targetUrl;
    if (fb.id) {
      try {
        const probed = await this.probeTranslators(fb.id, fb.type === 'films', this.mediaUrlCache.get(fb.id));
        if (probed.length > 0) {
          fb.translators = probed;
          const preferred = probed.find((t) => t.id === 1) || probed.find((t) => t.id === 56) || probed[0];
          fb.currentTranslatorId = preferred.id;
          if (fb.type === 'series' || fb.type === 'animation' || fb.type === 'cartoons') {
            const loaded = await this.getSeriesEpisodes(fb.id, fb.currentTranslatorId);
            if (loaded && loaded.length > 0) fb.seasons = loaded;
          }
        }
      } catch (_) {}
    } else if ((fb.type === 'series' || fb.type === 'animation' || fb.type === 'cartoons') && fb.id) {
      try {
        const loaded = await this.getSeriesEpisodes(fb.id, fb.currentTranslatorId || 56);
        if (loaded && loaded.length > 0) {
          fb.seasons = loaded;
        }
      } catch (_) {}
    }
    return fb;
  }
}

  public async getSeriesEpisodes(mediaId: string, translatorId: number): Promise<Season[]> {
    const cachedUrl = this.mediaUrlCache.get(mediaId);
    if (this.isKinobase() || this.isKinobase(mediaId) || this.isKinobase(cachedUrl)) {
      const filmUrl = await this.resolveKinobaseUrl(mediaId, this.mediaCache.get(mediaId));
      if (filmUrl) {
        const pd = await this.extractKinobasePlayerData(filmUrl);
        if (pd?.file) {
          const parsed = this.parseKinobaseSeriesAndTranslators(pd.file, pd.subtitle);
          if (parsed.seasons && parsed.seasons.length > 0) return parsed.seasons;
        }
      }
    }

    const mirrorsToTry = [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror)];
    const translatorsToTry = [translatorId];

    for (const mirror of mirrorsToTry) {
      for (const trId of translatorsToTry) {
        try {
          const formData = new URLSearchParams();
          formData.append('id', mediaId);
          formData.append('translator_id', trId.toString());
          formData.append('action', 'get_episodes');

          const res = await appFetch(`${mirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': this.mediaUrlCache.get(mediaId)?.replace(/^https?:\/\/[^/]+/, mirror) || `${mirror}/`,
              'User-Agent': BROWSER_USER_AGENT,
            },
            body: formData.toString(),
            signal: AbortSignal.timeout(this.timeoutMs),
          });

          if (!res.ok) continue;
          const text = await res.text();
          if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
            continue;
          }
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            continue;
          }
          if (!json || !json.success) continue;

          const seasonsDoc = cheerio.load(json.seasons || '');
          const episodesDoc = cheerio.load(json.episodes || '');

          const seasonsMap: Map<number, Season> = new Map();

          seasonsDoc('.b-simple_season__item').each((_, el) => {
            const seasonId = parseInt(seasonsDoc(el).attr('data-tab_id') || '0', 10);
            const title = seasonsDoc(el).text().trim() || `Сезон ${seasonId}`;
            if (seasonId > 0) {
              seasonsMap.set(seasonId, {
                id: seasonId,
                title,
                episodes: [],
              });
            }
          });

          episodesDoc('.b-simple_episode__item').each((_, el) => {
            const seasonId = parseInt(episodesDoc(el).attr('data-season_id') || '0', 10);
            const epId = parseInt(episodesDoc(el).attr('data-episode_id') || '0', 10);
            const epTitle = episodesDoc(el).text().trim() || `Серия ${epId}`;

            let season = seasonsMap.get(seasonId);
            if (!season) {
              season = { id: seasonId, title: `Сезон ${seasonId}`, episodes: [] };
              seasonsMap.set(seasonId, season);
            }
            season.episodes.push({
              id: epId,
              episodeId: epId,
              seasonId,
              title: epTitle,
            });
          });

          const seasons = Array.from(seasonsMap.values()).sort((a, b) => a.id - b.id);
          if (seasons.length > 0) {
            return seasons;
          }
        } catch (_) {}
      }
    }

    return [];
  }

  public async findAlternativeStream(params: {
    mediaId: string;
    title?: string;
    origTitle?: string;
    year?: number;
    season?: number;
    episode?: number;
    translatorId?: number;
  }): Promise<StreamData | null> {
    const cachedItem = this.mediaCache.get(params.mediaId);
    const filmUrl = await this.resolveKinobaseUrl(params.mediaId, {
      ...cachedItem,
      title: params.title || cachedItem?.title,
      origTitle: params.origTitle || cachedItem?.origTitle,
      year: params.year || cachedItem?.year,
    });
    if (!filmUrl) return null;

    const pd = await this.extractKinobasePlayerData(filmUrl);
    if (!pd) return null;

    if (pd.file) {
      const parsed = this.parseKinobaseSeriesAndTranslators(pd.file, pd.subtitle);
      const streams = parsed.getEpisodeStreams(params.translatorId, params.season, params.episode);
      if (streams.length > 0) {
        return {
          streams,
          subtitles: parsed.subtitles,
          isAlternative: true,
          sourceName: 'Kinobase HLS',
          trailerUrl: pd.trailerUrl,
        };
      }
    }

    if (pd.balancerSrc) {
      const bStream = await this.extractBalancerStream(pd.balancerSrc, params.episode);
      if (bStream && bStream.streams.length > 0) {
        return { ...bStream, trailerUrl: pd.trailerUrl };
      }
    }

    if (pd.kpId) {
      try {
        const embedRes = await appFetch(`https://api.delivembed.cc/embed/kp/${pd.kpId}`, {
          signal: AbortSignal.timeout(4000),
          headers: { 'User-Agent': BROWSER_USER_AGENT },
        });
        if (embedRes.ok) {
          const embedHtml = await embedRes.text();
          const m3u8Match = embedHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
          if (m3u8Match) {
            const streamUrl = m3u8Match[0];
            return {
              streams: [
                { quality: '1080p', hls: streamUrl, mp4: streamUrl },
                { quality: '720p', hls: streamUrl, mp4: streamUrl },
                { quality: '480p', hls: streamUrl, mp4: streamUrl },
              ],
              subtitles: [],
              isAlternative: true,
              sourceName: 'Collaps / Delivembed',
              trailerUrl: pd.trailerUrl,
            };
          }
        }
      } catch (_) {}
    }

    return null;
  }

  public async getStream(params: {
    mediaId: string;
    translatorId: number;
    season?: number;
    episode?: number;
    isCamRip?: boolean;
    isAds?: boolean;
    isDirector?: boolean;
  }): Promise<StreamData> {
    const normId = params.mediaId ? String(params.mediaId).replace(/[^0-9]/g, '') : '';
    let cachedItem = this.mediaCache.get(params.mediaId) || this.mediaCache.get(normId);
    if (!cachedItem && normId) {
      for (const item of this.mediaCache.values()) {
        if (item.id === normId || (item.url && item.url.includes(`/${normId}-`))) {
          cachedItem = item;
          break;
        }
      }
    }

    const currentYear = new Date().getFullYear();
    const isUnreleasedMovie = !!(
      cachedItem?.year &&
      cachedItem.year >= currentYear &&
      (!cachedItem.type || cachedItem.type === 'films')
    );

    if (
      this.isKinobase() ||
      this.isKinobase(params.mediaId) ||
      this.isKinobase(cachedItem?.url) ||
      this.isKinobase(this.mediaUrlCache.get(params.mediaId) || this.mediaUrlCache.get(normId))
    ) {
      const kinobaseStream = await this.findAlternativeStream({
        mediaId: params.mediaId,
        title: cachedItem?.title,
        origTitle: cachedItem?.origTitle,
        year: cachedItem?.year,
        season: params.season,
        episode: params.episode,
        translatorId: params.translatorId,
      });
      if (kinobaseStream && kinobaseStream.streams.length > 0) {
        return kinobaseStream;
      }
      throw new Error(
        isUnreleasedMovie
          ? `Фильм «${cachedItem?.title || 'Фильм'}» (${cachedItem?.year || currentYear}) ещё не вышел в цифровой релиз.`
          : 'Видеопоток для данного фильма временно недоступен на Kinobase. Попробуйте другое зеркало в Настройках.'
      );
    }

    // Fast path for unreleased future titles: don't loop through doomed mirrors
    const mirrorsToTry = isUnreleasedMovie
      ? [this.activeMirror]
      : [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror).slice(0, 3)];

    const translatorsToTry: number[] = [];

    if (params.translatorId !== undefined && params.translatorId !== null) {
      translatorsToTry.push(params.translatorId);
    }

    if (!isUnreleasedMovie) {
      // If primary translator fails, try known popular fallbacks
      const cachedTranslators = (cachedItem?.translators || this.mediaCache.get(params.mediaId)?.translators);
      if (cachedTranslators) {
        for (const t of cachedTranslators) {
          if (!translatorsToTry.includes(t.id)) translatorsToTry.push(t.id);
        }
      }
      // Also include 0 for original/Russian tracks and core fallbacks
      for (const popId of [0, 56, 1]) {
        if (!translatorsToTry.includes(popId)) translatorsToTry.push(popId);
      }
    } else if (!translatorsToTry.includes(0)) {
      translatorsToTry.push(0);
    }

    const actionsToTry: Array<{ action: 'get_stream' | 'get_movie'; season?: number; episode?: number }> = [];
    if (params.season !== undefined && params.episode !== undefined && params.season > 0 && params.episode > 0) {
      actionsToTry.push({ action: 'get_stream', season: params.season, episode: params.episode });
      if (!isUnreleasedMovie) actionsToTry.push({ action: 'get_movie' });
    } else {
      actionsToTry.push({ action: 'get_movie' });
      if (!isUnreleasedMovie) actionsToTry.push({ action: 'get_stream', season: 1, episode: 1 });
    }

    let hadAntiBotOrSession = false;
    let lastActiveMirrorMessage = '';

    for (const mirror of mirrorsToTry) {
      let mirrorFailed = false;
      for (const trId of translatorsToTry) {
        if (mirrorFailed) break;
        if (trId === undefined || trId === null) continue;
        for (const act of actionsToTry) {
          try {
            const formData = new URLSearchParams();
            formData.append('id', params.mediaId);
            formData.append('translator_id', trId.toString());

            if (act.action === 'get_stream') {
              formData.append('season', (act.season || 1).toString());
              formData.append('episode', (act.episode || 1).toString());
              formData.append('action', 'get_stream');
            } else {
              formData.append('is_camrip', params.isCamRip ? '1' : '0');
              formData.append('is_ads', params.isAds ? '1' : '0');
              formData.append('is_director', params.isDirector ? '1' : '0');
              formData.append('action', 'get_movie');
            }

            let referer = this.mediaUrlCache.get(params.mediaId)?.replace(/^https?:\/\/[^/]+/, mirror);
            if (!referer || !referer.includes('.html')) {
              for (const item of this.mediaCache.values()) {
                if ((item.id === params.mediaId || item.url?.includes(`/${params.mediaId}-`)) && item.url?.includes('.html')) {
                  referer = item.url.startsWith('http')
                    ? item.url.replace(/^https?:\/\/[^/]+/, mirror)
                    : `${mirror}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
                  break;
                }
              }
            }
            if (!referer || !referer.includes('.html')) {
              referer = `${mirror}/`;
            }

            const res = await appFetch(`${mirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': referer,
                'User-Agent': BROWSER_USER_AGENT,
              },
              body: formData.toString(),
              signal: AbortSignal.timeout(isUnreleasedMovie ? 2500 : Math.min(this.timeoutMs, 4000)),
            });

            if (!res.ok) {
              mirrorFailed = true;
              break;
            }
            const text = await res.text();
            if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
              // Only mark anti-bot challenge if the ACTIVE mirror requested it
              if (mirror === this.activeMirror && this.isAntiBot(text)) {
                hadAntiBotOrSession = true;
              }
              mirrorFailed = true;
              break;
            }
            let json: any;
            try {
              json = JSON.parse(text);
            } catch {
              mirrorFailed = true;
              break;
            }
            if (json && !json.success) {
              if (mirror === this.activeMirror) {
                if (this.isAntiBot(json.message || '')) {
                  hadAntiBotOrSession = true;
                  mirrorFailed = true;
                  break;
                } else if (json.message) {
                  lastActiveMirrorMessage = json.message;
                }
              }
              continue;
            }
            if (json && json.success && json.url) {
              return parseStreamData(json.url, json.subtitle, json.thumbnails);
            }
          } catch (err: any) {
            mirrorFailed = true;
            break;
          }
        }
      }
    }

    // Try finding alternative stream online via Kinobase / web balancers
    if (!isUnreleasedMovie) {
      try {
        const altStream = await this.findAlternativeStream({
          mediaId: params.mediaId,
          title: cachedItem?.title,
          origTitle: cachedItem?.origTitle,
          year: cachedItem?.year,
          season: params.season,
          episode: params.episode,
          translatorId: params.translatorId,
        });
        if (altStream && altStream.streams && altStream.streams.length > 0) {
          return altStream;
        }
      } catch (_) {}
    }

    if (isUnreleasedMovie) {
      throw new Error(
        `Фильм «${cachedItem?.title || 'Диггер'}» (${cachedItem?.year || currentYear}) ещё не вышел в прокат или цифровой релиз. Доступен официальный трейлер.`
      );
    }

    if (hadAntiBotOrSession) {
      throw new Error(
        'HDRezka требует пройти проверку «Я не бот» или обновить сессию. Нажмите «Пройти проверку» для запуска видео.'
      );
    }

    if (lastActiveMirrorMessage) {
      throw new Error(lastActiveMirrorMessage);
    }

    throw new Error(
      'Видеопоток временно недоступен или ограничен правообладателем на серверах HDRezka. Попробуйте выбрать другую озвучку, другое зеркало в Настройках или открыть другой фильм.'
    );
  }

  public async searchFast(query: string) {
    if (!query.trim()) return [];
    if (this.isKinobase()) {
      const kItems = await this.searchKinobase(query);
      if (kItems.length > 0) return kItems;
    }
    try {
      const formData = new URLSearchParams();
      formData.append('q', query.trim());

      const res = await appFetch(`${this.activeMirror}/engine/ajax/search.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': this.activeMirror,
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const html = await res.text();
      if (this.isAntiBot(html)) throw new Error('Anti-bot challenge');
      const $ = cheerio.load(html);
      const results: Array<{
        id: string;
        title: string;
        url: string;
        rating?: number;
        origTitle?: string;
        year?: number;
        type?: ContentType;
      }> = [];

      $('.b-search__section_list li').each((_, el) => {
        const a = $(el).find('a');
        const title = $(el).find('.enty').text().trim() || a.text().trim();
        const url = a.attr('href') || '';
        const fullText = a.text().trim();
        const rText = $(el).find('.rating').text().trim();
        const rating = rText ? parseFloat(rText) : undefined;

        const yMatch = fullText.match(/\b(19\d{2}|20\d{2})\b/);
        const year = yMatch ? parseInt(yMatch[1], 10) : undefined;

        let type: ContentType = 'films';
        if (url.includes('/series/')) type = 'series';
        else if (url.includes('/cartoons/')) type = 'cartoons';
        else if (url.includes('/animation/')) type = 'animation';

        const parenMatch = fullText.match(/\(([^)]+)\)/);
        let origTitle = '';
        if (parenMatch) {
          const parts = parenMatch[1].split(',').map(s => s.trim());
          origTitle = parts.find(p => !/\b(19\d{2}|20\d{2})\b/.test(p) && !['мультфильм', 'сериал', 'аниме', 'фильм'].includes(p.toLowerCase())) || parts[0];
        }

        const id = url.split('/').pop()?.split('-')[0] || '';
        const cached = this.mediaCache.get(url) || this.mediaCache.get(id);
        const fbMatch = FALLBACK_ITEMS.find((fi) => fi.id === id || fi.url === url || fi.title.toLowerCase() === title.toLowerCase());
        const poster = cached?.poster || fbMatch?.poster || '';

        if (title && url) {
          const item = { id, title, origTitle, url, year, rating, type, poster };
          this.mediaCache.set(url, item);
          if (id) this.mediaCache.set(id, item);
          results.push(item);
        }
      });

      if (results.length > 0) return results;
    } catch {}

    const kItems = await this.searchKinobase(query);
    if (kItems.length > 0) return kItems;

    const q = query.toLowerCase();
    return FALLBACK_ITEMS.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.origTitle && i.origTitle.toLowerCase().includes(q))
    ).map((i) => {
      const item = {
        id: i.id,
        title: i.title,
        origTitle: i.origTitle,
        url: i.url,
        year: i.year,
        rating: i.rating,
        type: i.type,
      };
      this.mediaCache.set(i.url, item);
      this.mediaCache.set(i.id, item);
      return item;
    });
  }

  public async searchAdvanced(query: string, page = 1): Promise<SearchResult> {
    if (this.isKinobase()) {
      const kItems = await this.searchKinobase(query);
      if (kItems.length > 0) {
        return { items: kItems, page: 1, hasMore: false };
      }
    }
    try {
      const url = `${this.activeMirror}/search/?do=search&subaction=search&q=${encodeURIComponent(query)}&page=${page}`;
      const html = await this.fetchHtml(url);
      if (this.isAntiBot(html)) throw new Error('Anti-bot challenge');
      const $ = cheerio.load(html);

      const items: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item) {
          this.mediaCache.set(item.url, item);
          this.mediaCache.set(item.id, item);
          items.push(item);
        }
      });

      if (items.length > 0) {
        const hasMore = $('.b-navigation__next, a:contains("Вперед"), a:contains("Вперёд")').length > 0;
        return {
          items,
          page,
          hasMore,
        };
      }
    } catch {}

    // Fallback: Kinobase search, then live search.php
    const kItems = await this.searchKinobase(query);
    if (kItems.length > 0) {
      return { items: kItems, page: 1, hasMore: false };
    }

    const fastResults = await this.searchFast(query);
    const q = query.toLowerCase();
    const fallbackMatches = FALLBACK_ITEMS.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.origTitle && i.origTitle.toLowerCase().includes(q))
    );

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    for (const fr of fastResults) {
      if (!seen.has(fr.url)) {
        seen.add(fr.url);
        const fbMatch = FALLBACK_ITEMS.find(
          (fi) => fi.id === fr.id || fi.url === fr.url || fi.title.toLowerCase() === fr.title.toLowerCase()
        );
        const item: MediaItem = {
          id: fr.id || fr.url,
          title: fr.title,
          origTitle: fr.origTitle || fbMatch?.origTitle,
          url: fr.url,
          year: fr.year || fbMatch?.year,
          rating: fr.rating || fbMatch?.rating,
          type: fr.type || fbMatch?.type || 'films',
          poster: fbMatch?.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=80',
          info: fbMatch?.info || `HDRezka: ${fr.title} (${fr.year || ''})`,
        };
        this.mediaCache.set(fr.url, item);
        this.mediaCache.set(item.id, item);
        items.push(item);
      }
    }

    for (const fb of fallbackMatches) {
      if (!seen.has(fb.url)) {
        seen.add(fb.url);
        this.mediaCache.set(fb.url, fb);
        this.mediaCache.set(fb.id, fb);
        items.push(fb);
      }
    }

    return {
      items,
      page: 1,
      hasMore: false,
    };
  }
}
