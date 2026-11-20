

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
} from '../../../shared/types';
import { DEFAULT_MIRRORS } from '../../../shared/constants';
import { parseStreamData } from './decoder';
import {
  FALLBACK_HERO,
  FALLBACK_ITEMS,
  FALLBACK_HOME_SECTIONS,
  getFallbackDetails,
} from './fallbackData';

async function solveAnubisChallenge(mirrorOrUrl: string, html: string): Promise<boolean> {
  const challengeMatch = html.match(/id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/i);
  if (!challengeMatch) return false;
  try {
    const challengeData = JSON.parse(challengeMatch[1]);
    const { randomData, id } = challengeData.challenge || {};
    const difficulty = challengeData.rules?.difficulty ?? 2;
    if (!randomData || !id) return false;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const p = Math.floor(difficulty / 2);
    const u = difficulty % 2 !== 0;

    const t0 = Date.now();
    let nonce = 0;
    let foundHash = '';
    while (true) {
      const hash = crypto.createHash('sha256').update(randomData + nonce).digest();
      let ok = true;
      for (let s = 0; s < p; s++) {
        if (hash[s] !== 0) { ok = false; break; }
      }
      if (ok && u && (hash[p] >> 4) !== 0) { ok = false; }
      if (ok) {
        foundHash = hash.toString('hex');
        break;
      }
      nonce++;
      if (nonce > 500000) break;
    }
    if (!foundHash) return false;
    const elapsed = Date.now() - t0;

    const parsed = new URL(mirrorOrUrl);
    const origin = parsed.origin;
    const passUrl = `${origin}/.within.website/x/cmd/anubis/api/pass-challenge?id=${encodeURIComponent(id)}&response=${encodeURIComponent(foundHash)}&nonce=${nonce}&redir=%2F&elapsedTime=${elapsed}`;

    let electron: any;
    try { electron = require('electron'); } catch (_) {}

    let cookieVerification = '';
    if (electron?.session?.defaultSession?.cookies) {
      try {
        const existing = await electron.session.defaultSession.cookies.get({ url: origin });
        for (const c of existing) {
          if (c.name.includes('cookie-verification')) {
            cookieVerification = `${c.name}=${c.value}`;
            break;
          }
        }
      } catch (_) {}
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Referer': `${origin}/`,
    };
    if (cookieVerification) {
      headers['Cookie'] = cookieVerification;
    }

    const passRes = await globalThis.fetch(passUrl, {
      headers,
      redirect: 'manual',
    });

    const setCookies = (passRes.headers as any).getSetCookie
      ? (passRes.headers as any).getSetCookie()
      : [passRes.headers.get('set-cookie')];

    for (const sc of setCookies) {
      if (!sc) continue;
      const parts = sc.split(';')[0].split('=');
      const name = parts[0]?.trim();
      const value = parts.slice(1).join('=').trim();
      if (name && name.toLowerCase().includes('anubis-auth') && value && electron?.session?.defaultSession?.cookies) {
        try {
          await electron.session.defaultSession.cookies.set({
            url: origin,
            name,
            value,
            path: '/',
            secure: true,
            sameSite: 'lax',
          });
        } catch (_) {}
        return true;
      }
    }
    return passRes.status === 302 || passRes.status === 200;
  } catch (_) {
    return false;
  }
}

async function appFetch(input: string | URL | Request, init?: RequestInit & { skipAutoSolve?: boolean }): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : (input as any).url || input.toString();
  let electron: any;
  try {
    electron = require('electron');
  } catch (_) {}

  const makeReq = async () => {
    if (electron && electron.net && typeof electron.net.fetch === 'function') {
      const headers = new Headers(init?.headers || {});

      // Explicitly extract session cookies to ensure bot verification tokens are never lost
      if (electron.session?.defaultSession?.cookies) {
        try {
          const cookies = await electron.session.defaultSession.cookies.get({ url: urlStr });
          if (cookies && cookies.length > 0) {
            const validCookies = cookies.filter((c: any) => c.value && c.value.length > 0);
            if (validCookies.length > 0) {
              const cookieHeader = validCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
              headers.set('Cookie', cookieHeader);
            }
          }
        } catch (_) {}
      }

      if (!headers.has('User-Agent')) {
        headers.set(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        );
      }

      return await electron.net.fetch(input as any, { ...init, headers, credentials: 'include' });
    }
    return await globalThis.fetch(input, init);
  };

  const res = await makeReq();

  // If Anubis PoW challenge page was encountered, automatically solve it and retry once
  if (!init?.skipAutoSolve && res.status === 200 && res.clone) {
    try {
      const clone = res.clone();
      const text = await clone.text();
      if (text.includes('id="anubis_challenge"') && text.includes('anubis')) {
        const solved = await solveAnubisChallenge(urlStr, text);
        if (solved) {
          const retried = await makeReq();
          if (retried.ok) {
            return retried;
          }
        }
      }
    } catch (_) {}
  }

  return res;
}

export class RezkaProvider implements IProvider {
  public id = 'hdrezka';
  public name = 'HDRezka Provider';
  public version = '0.0.28';

  private activeMirror: string;
  private mirrors: string[];
  private timeoutMs: number;
  private mediaCache: Map<string, Partial<MediaItem>> = new Map();
  private mediaUrlCache: Map<string, string> = new Map();

  constructor(activeMirror = 'https://hdrezka.kim', mirrors = DEFAULT_MIRRORS, timeoutMs = 8000) {
    if (!activeMirror || activeMirror.includes('hdrezka.ag') || activeMirror.includes('rezka-ua.tv') || activeMirror.includes('rezka.fi')) {
      activeMirror = 'https://hdrezka.kim';
    }
    this.activeMirror = activeMirror;
    this.mirrors = [...mirrors].filter((m) => !m.includes('hdrezka.ag') && !m.includes('rezka-ua.tv') && !m.includes('rezka.fi') && !m.includes('hdrezka.is'));
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

  public async checkMirrors(): Promise<MirrorStatus[]> {
    const results: MirrorStatus[] = [];

    for (const mirror of this.mirrors) {
      const cleanUrl = mirror.replace(/\/$/, '');
      if (cleanUrl.includes('rezka-ua.tv') || cleanUrl.includes('hdrezka.ag')) {
        results.push({
          url: cleanUrl,
          isAvailable: false,
          latencyMs: 9999,
          lastChecked: Date.now(),
          needsVerification: false,
        });
        continue;
      }

      const t0 = Date.now();
      try {
        const res = await appFetch(cleanUrl, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(5000),
          skipAutoSolve: true,
        });
        const latency = Date.now() - t0;
        const text = await res.text();
        const isBlocked = this.isAntiBot(text);
        const hasRezkaContent = text.includes('b-content') || text.includes('b-post') || text.includes('b-top');
        const isFakeLogin = text.includes('Вход на HDrezka') || (text.includes('card-face') && !hasRezkaContent);
        const isLiveRezka = (hasRezkaContent || isBlocked) && !isFakeLogin;
        const isLiveSite = isLiveRezka && text.length > 200;
        const isAvail = (res.ok || res.status === 403) && isLiveSite;
        results.push({
          url: cleanUrl,
          isAvailable: isAvail,
          latencyMs: isAvail ? latency : 9999,
          lastChecked: Date.now(),
          needsVerification: isAvail && isBlocked && !hasRezkaContent,
        });
      } catch {
        results.push({
          url: cleanUrl,
          isAvailable: false,
          latencyMs: 9999,
          lastChecked: Date.now(),
          needsVerification: false,
        });
      }
    }

    return results;
  }

  public async selectBestMirror(): Promise<string> {
    if (this.activeMirror.includes('rezka-ua.tv') || this.activeMirror.includes('hdrezka.ag') || this.activeMirror.includes('rezka.fi')) {
      this.activeMirror = 'https://hdrezka.kim';
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
      'https://hdrezka-home.tv',
      'https://rezka.fi',
      'https://rezka-tv.org',
      'https://hdrezka.me',
      'https://rezka.ag',
      'https://rezkify.com',
      'https://hdrezka.kim',
      'https://rezka.pub',
      'https://hdrezka.sh',
      'https://rezka-ua.org',
      'https://hdrezka.club',
      'https://hdrezka.is',
      'https://hdrezka.top',
      'https://rezka.lat',
    ];
    for (const s of seeds) candidateUrls.add(s);

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
            skipAutoSolve: true,
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

    const candidatesList = Array.from(candidateUrls).filter(c => !currentSet.has(c.toLowerCase()));

    await Promise.allSettled(
      candidatesList.map(async (url) => {
        try {
          const res = await appFetch(url, {
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(4500),
            skipAutoSolve: true,
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

  public async getHomeSections() {
    try {
      const html = await this.fetchHtml(this.activeMirror);
      if (this.isAntiBot(html)) {
        console.warn('[RezkaProvider] Active mirror protected by anti-bot. Loading live sections from search.php.');
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
        console.warn('[RezkaProvider] Parsed 0 items from mirror. Loading live sections from search.php.');
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
      console.warn('[RezkaProvider] Error fetching home sections, trying live search.php:', err);
      return await this.fetchLiveRezkaHomeSections();
    }
  }

  public async getCatalog(filter: CatalogFilter) {
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
    const action = isMovie ? 'get_movie' : 'get_episodes';
    const trIds = Object.keys(RezkaProvider.POPULAR_TRANSLATORS).map(Number);

    const checkTr = async (trId: number, act: string): Promise<Translator | null> => {
      for (const mirror of primaryMirrors) {
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
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
            body: formData.toString(),
            signal: AbortSignal.timeout(2500),
          });

          if (!res.ok) continue;
          const text = await res.text();
          if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) continue;
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
      const chunk = trIds.slice(i, i + chunkSize);
      const chunkRes = await Promise.all(chunk.map((id) => checkTr(id, action)));
      for (const item of chunkRes) {
        if (item) results.push(item);
      }
    }

    if (results.length === 0) {
      const altAction = isMovie ? 'get_episodes' : 'get_movie';
      for (let i = 0; i < trIds.length; i += chunkSize) {
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

      // Try all mirrors to find one not behind anti-bot
      const mirrorsToTry = [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror)];
      let html = '';
      let usedMirror = this.activeMirror;
      for (const mirror of mirrorsToTry) {
        try {
          const tryUrl = urlPath ? `${mirror}${urlPath}` : targetUrl;
          html = await this.fetchHtml(tryUrl);
          if (!this.isAntiBot(html)) {
            usedMirror = mirror;
            break;
          }
        } catch {}
      }

      if (this.isAntiBot(html) || !html) {
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
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

  public async getStream(params: {
    mediaId: string;
    translatorId: number;
    season?: number;
    episode?: number;
    isCamRip?: boolean;
    isAds?: boolean;
    isDirector?: boolean;
  }): Promise<StreamData> {
    const mirrorsToTry = [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror)];
    const translatorsToTry: number[] = [];

    if (params.translatorId !== undefined && params.translatorId !== null) {
      translatorsToTry.push(params.translatorId);
    }

    // If primary translator fails, try known popular fallbacks
    const cachedTranslators = this.mediaCache.get(params.mediaId)?.translators;
    if (cachedTranslators) {
      for (const t of cachedTranslators) {
        if (!translatorsToTry.includes(t.id)) translatorsToTry.push(t.id);
      }
    }
    // Also include 0 for original/Russian tracks and standard popular IDs
    for (const popId of [0, 56, 1, 238, 430]) {
      if (!translatorsToTry.includes(popId)) translatorsToTry.push(popId);
    }

    const actionsToTry: Array<{ action: 'get_stream' | 'get_movie'; season?: number; episode?: number }> = [];
    if (params.season !== undefined && params.episode !== undefined && params.season > 0 && params.episode > 0) {
      actionsToTry.push({ action: 'get_stream', season: params.season, episode: params.episode });
      actionsToTry.push({ action: 'get_movie' });
    } else {
      actionsToTry.push({ action: 'get_movie' });
      actionsToTry.push({ action: 'get_stream', season: 1, episode: 1 });
    }

    let hadAntiBotOrSession = false;
    let lastActiveMirrorMessage = '';

    for (const mirror of mirrorsToTry) {
      for (const trId of translatorsToTry) {
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              },
              body: formData.toString(),
              signal: AbortSignal.timeout(this.timeoutMs),
            });

            if (!res.ok) continue;
            const text = await res.text();
            if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
              // Only mark anti-bot challenge if the ACTIVE mirror requested it
              if (mirror === this.activeMirror && this.isAntiBot(text)) {
                hadAntiBotOrSession = true;
              }
              continue;
            }
            let json: any;
            try {
              json = JSON.parse(text);
            } catch {
              continue;
            }
            if (json && !json.success) {
              if (mirror === this.activeMirror) {
                if (this.isAntiBot(json.message || '')) {
                  hadAntiBotOrSession = true;
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
            // ignore and try next mirror/translator
          }
        }
      }
    }

    if (hadAntiBotOrSession) {
      throw new Error(
        'HDRezka требует пройти проверку «Я не бот» или обновить сессию. Нажмите «Пройти проверку» для запуска видео.'
      );
    }

    if (lastActiveMirrorMessage) {
      throw new Error(lastActiveMirrorMessage);
    }

    const cachedItem = this.mediaCache.get(params.mediaId);

    const currentYear = new Date().getFullYear();
    if (cachedItem && cachedItem.year && cachedItem.year >= currentYear && (!cachedItem.type || cachedItem.type === 'films')) {
      throw new Error(
        `Фильм «${cachedItem.title || 'Диггер'}» (${cachedItem.year}) ещё не вышел в прокат или временно отсутствует в каталоге HDRezka.`
      );
    }

    throw new Error(
      'Видеопоток временно недоступен или ограничен правообладателем на серверах HDRezka. Попробуйте выбрать другую озвучку, другое зеркало в Настройках или открыть другой фильм.'
    );
  }

  public async searchFast(query: string) {
    if (!query.trim()) return [];
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

    // Fallback: live search.php which bypasses anti-bot
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
