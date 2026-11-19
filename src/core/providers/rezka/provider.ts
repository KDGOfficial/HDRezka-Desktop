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
  getFallbackStream,
} from './fallbackData';

export class RezkaProvider implements IProvider {
  public id = 'hdrezka';
  public name = 'HDRezka Provider';
  public version = '0.0.2';

  private activeMirror: string;
  private mirrors: string[];
  private timeoutMs: number;

  constructor(activeMirror = 'https://hdrezka.ag', mirrors = DEFAULT_MIRRORS, timeoutMs = 8000) {
    this.activeMirror = activeMirror;
    this.mirrors = [...mirrors];
    this.timeoutMs = timeoutMs;
  }

  private isAntiBot(html: string): boolean {
    if (!html) return false;
    return (
      html.includes('anubis_challenge') ||
      html.includes('Проверяем, что вы не бот') ||
      html.includes('cf-browser-verification') ||
      html.includes('challenge-running') ||
      html.includes('Attention Required! | Cloudflare')
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
      'X-Requested-With': referer ? 'XMLHttpRequest' : '',
      'Referer': referer || this.activeMirror,
    };
  }

  private async fetchHtml(url: string, retries = 2): Promise<string> {
    let lastError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
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
      const t0 = Date.now();
      try {
        const res = await fetch(cleanUrl, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - t0;
        const text = await res.text();
        const isBlocked = this.isAntiBot(text);
        const isAvail = res.ok && !isBlocked && text.includes('b-content');
        results.push({
          url: cleanUrl,
          isAvailable: isAvail,
          latencyMs: isAvail ? latency : 9999,
          lastChecked: Date.now(),
        });
      } catch {
        results.push({
          url: cleanUrl,
          isAvailable: false,
          latencyMs: 9999,
          lastChecked: Date.now(),
        });
      }
    }

    return results;
  }

  public async selectBestMirror(): Promise<string> {
    const statuses = await this.checkMirrors();
    const available = statuses.filter(s => s.isAvailable);

    if (available.length > 0) {
      available.sort((a, b) => a.latencyMs - b.latencyMs);
      this.activeMirror = available[0].url;
      return this.activeMirror;
    }

    return this.activeMirror;
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
    if (catEl.hasClass('series')) type = 'series';
    else if (catEl.hasClass('cartoons')) type = 'cartoons';
    else if (catEl.hasClass('animation')) type = 'animation';

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

  public async getHomeSections() {
    try {
      const html = await this.fetchHtml(this.activeMirror);
      if (this.isAntiBot(html)) {
        console.warn('[RezkaProvider] Active mirror is protected by anti-bot. Using fallback home sections.');
        return FALLBACK_HOME_SECTIONS;
      }
      const $ = cheerio.load(html);

      const allItems: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item && !allItems.some(x => x.id === item.id)) {
          allItems.push(item);
        }
      });

      if (allItems.length === 0) {
        console.warn('[RezkaProvider] Parsed 0 items from mirror. Using fallback home sections.');
        return FALLBACK_HOME_SECTIONS;
      }

      // Hero: choose first high-profile item
      const hero = allItems.length > 0 ? allItems[0] : null;

      // Segment items into categories
      const popular = allItems.slice(0, 16);
      const newReleases = allItems.slice(16, 32);
      const topMovies = allItems.filter(i => i.type === 'films').slice(0, 16);
      const topSeries = allItems.filter(i => i.type === 'series').slice(0, 16);
      const recommendations = allItems.filter(i => (i.rating || 0) >= 7.0 || i.type === 'cartoons').slice(0, 16);
      const expected = allItems.slice(32, 48);

      return {
        hero,
        popular: popular.length > 0 ? popular : allItems.slice(0, 12),
        newReleases: newReleases.length > 0 ? newReleases : allItems.slice(0, 12),
        topMovies: topMovies.length > 0 ? topMovies : allItems.filter(i => i.type === 'films'),
        topSeries: topSeries.length > 0 ? topSeries : allItems.filter(i => i.type === 'series'),
        recommendations: recommendations.length > 0 ? recommendations : allItems.slice(0, 12),
        expected: expected.length > 0 ? expected : allItems.slice(12, 24),
      };
    } catch (err) {
      console.warn('[RezkaProvider] Error fetching home sections, falling back:', err);
      return FALLBACK_HOME_SECTIONS;
    }
  }

  public async getCatalog(filter: CatalogFilter) {
    try {
      let path = `/${filter.type}/`;
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

  public async getDetails(urlOrId: string): Promise<MediaDetails> {
    try {
      let targetUrl = urlOrId;
      if (!targetUrl.startsWith('http')) {
        targetUrl = targetUrl.startsWith('/') ? `${this.activeMirror}${targetUrl}` : `${this.activeMirror}/${targetUrl}`;
      }

      const html = await this.fetchHtml(targetUrl);
      if (this.isAntiBot(html)) {
        return getFallbackDetails(urlOrId);
      }
      const $ = cheerio.load(html);

      const id = $('#post_id').attr('value') ||
                 $('#send-video-issue').attr('data-id') ||
                 $('#user-favorites-holder').attr('data-post_id') ||
                 targetUrl.split('/').pop()?.split('-')[0] || '';

      const title = $('.b-post__title h1, .b-post__title').first().text().trim();
      if (!title) {
        return getFallbackDetails(urlOrId);
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

    // Translators
    const translators: Translator[] = [];
    $('#translators-list li').each((_, el) => {
      const trId = parseInt($(el).attr('data-translator_id') || '0', 10);
      const trName = $(el).text().trim() || $(el).attr('title') || '';
      const isPrem = $(el).hasClass('b-prem_translator');
      const isCamRip = $(el).attr('data-camrip') === '1';
      const isAds = $(el).attr('data-ads') === '1';
      const isDirector = $(el).attr('data-director') === '1';

      if (trId > 0 && trName) {
        translators.push({
          id: trId,
          name: trName,
          premium: isPrem,
          camrip: isCamRip,
          ads: isAds,
          director: isDirector,
        });
      }
    });

    // Auto fallback for single translator if translators list is missing
    if (translators.length === 0) {
      const cdnScript = $('script:contains("initCDN")').text();
      const matchTr = cdnScript.match(/initCDN(?:Series|Movies)Events\(\d+,\s*(\d+)/);
      const defaultId = matchTr ? parseInt(matchTr[1], 10) : 56;
      translators.push({
        id: defaultId,
        name: 'Оригинал / По умолчанию',
        premium: false,
      });
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

    const currentTranslatorId = translators[0]?.id;

    // Fetch initial seasons/episodes if TV series
    let seasons: Season[] | undefined;
    if (type === 'series' && currentTranslatorId) {
      try {
        seasons = await this.getSeriesEpisodes(id, currentTranslatorId);
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
    };
  } catch (err) {
    console.warn('[RezkaProvider] Failed to fetch details, returning fallback:', err);
    return getFallbackDetails(urlOrId);
  }
}

  public async getSeriesEpisodes(mediaId: string, translatorId: number): Promise<Season[]> {
    const formData = new URLSearchParams();
    formData.append('id', mediaId);
    formData.append('translator_id', translatorId.toString());
    formData.append('action', 'get_episodes');

    const res = await fetch(`${this.activeMirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': this.activeMirror,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const json = await res.json();
    if (!json.success) {
      throw new Error('Failed to fetch series episodes');
    }

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

      const season = seasonsMap.get(seasonId);
      if (season) {
        season.episodes.push({
          id: epId,
          episodeId: epId,
          seasonId,
          title: epTitle,
        });
      } else {
        seasonsMap.set(seasonId, {
          id: seasonId,
          title: `Сезон ${seasonId}`,
          episodes: [{
            id: epId,
            episodeId: epId,
            seasonId,
            title: epTitle,
          }],
        });
      }
    });

    return Array.from(seasonsMap.values()).sort((a, b) => a.id - b.id);
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
    try {
      const formData = new URLSearchParams();
      formData.append('id', params.mediaId);
      formData.append('translator_id', params.translatorId.toString());

      if (params.season !== undefined && params.episode !== undefined) {
        formData.append('season', params.season.toString());
        formData.append('episode', params.episode.toString());
        formData.append('action', 'get_stream');
      } else {
        formData.append('is_camrip', params.isCamRip ? '1' : '0');
        formData.append('is_ads', params.isAds ? '1' : '0');
        formData.append('is_director', params.isDirector ? '1' : '0');
        formData.append('action', 'get_movie');
      }

      const res = await fetch(`${this.activeMirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': this.activeMirror,
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const json = await res.json();
      if (!json.success || !json.url) {
        throw new Error('Video stream is not available or blocked');
      }

      return parseStreamData(json.url, json.subtitle, json.thumbnails);
    } catch (err) {
      console.warn('[RezkaProvider] Stream fetch failed or blocked, using fallback stream:', err);
      return getFallbackStream();
    }
  }

  public async searchFast(query: string) {
    if (!query.trim()) return [];
    try {
      const formData = new URLSearchParams();
      formData.append('q', query.trim());

      const res = await fetch(`${this.activeMirror}/engine/ajax/search.php`, {
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
      const results: Array<{ title: string; url: string; rating?: number }> = [];

      $('.b-search__section_list li').each((_, el) => {
        const a = $(el).find('a');
        const title = $(el).find('.enty').text().trim() || a.text().trim();
        const url = a.attr('href') || '';
        const rText = $(el).find('.rating').text().trim();
        const rating = rText ? parseFloat(rText) : undefined;

        if (title && url) {
          results.push({ title, url, rating });
        }
      });

      if (results.length > 0) return results;
    } catch {}

    const q = query.toLowerCase();
    return FALLBACK_ITEMS.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.origTitle && i.origTitle.toLowerCase().includes(q))
    ).map((i) => ({ title: i.title, url: i.url, rating: i.rating }));
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
        if (item) items.push(item);
      });

      if (items.length === 0) throw new Error('No search results');

      const hasMore = $('.b-navigation__next, a:contains("Вперед"), a:contains("Вперёд")').length > 0;

      return {
        items,
        page,
        hasMore,
      };
    } catch {
      const q = query.toLowerCase();
      const matched = FALLBACK_ITEMS.filter(
        (i) => i.title.toLowerCase().includes(q) || (i.origTitle && i.origTitle.toLowerCase().includes(q))
      );
      return {
        items: matched,
        page: 1,
        hasMore: false,
      };
    }
  }
}
