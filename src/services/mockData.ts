import { MediaItem, MediaDetails, PlaybackSource } from '../types/media';

export const MOCK_HERO_ITEMS: MediaItem[] = [
  {
    id: 'hero-1',
    title: 'Дюна: Часть вторая',
    originalTitle: 'Dune: Part Two',
    url: '/films/fiction/dune-part-two.html',
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1920&auto=format&fit=crop&q=80',
    year: 2024,
    country: 'США, Канада',
    rating: 8.5,
    ratingCount: 142000,
    genres: ['Фантастика', 'Приключения', 'Драма', 'Боевик'],
    type: 'movie',
    duration: '166 мин.',
    details: 'Герцог Пол Атрейдес объединяется с чани и фрименами, чтобы отомстить заговорщикам, уничтожившим его семью.'
  },
  {
    id: 'hero-2',
    title: 'Одни из нас',
    originalTitle: 'The Last of Us',
    url: '/series/drama/the-last-of-us.html',
    poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1920&auto=format&fit=crop&q=80',
    year: 2023,
    country: 'США',
    rating: 8.8,
    ratingCount: 220000,
    genres: ['Драма', 'Фантастика', 'Боевик', 'Ужасы'],
    type: 'series',
    duration: '1 сезон (9 серий)',
    episodesCount: '1 сезон, 9 серий',
    details: 'Закаленный в борьбе за выживание Джоэл получает задание вывести 14-летнюю Элли из карантинной зоны через опустошенные США.'
  },
  {
    id: 'hero-3',
    title: 'Киберпанк: Бегущие по краю',
    originalTitle: 'Cyberpunk: Edgerunners',
    url: '/animation/anime/cyberpunk-edgerunners.html',
    poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1920&auto=format&fit=crop&q=80',
    year: 2022,
    country: 'Япония, Польша',
    rating: 8.4,
    ratingCount: 88000,
    genres: ['Аниме', 'Фантастика', 'Боевик'],
    type: 'anime',
    duration: '10 серий',
    episodesCount: '1 сезон, 10 серий',
    details: 'Парень с улицы пытается выжить в Найт-Сити — мегаполисе будущего, помешанном на технологиях и модификациях тела.'
  }
];

export const MOCK_POPULAR_MOVIES: MediaItem[] = [
  {
    id: 'm-1',
    title: 'Оппенгеймер',
    originalTitle: 'Oppenheimer',
    url: '/films/drama/oppenheimer.html',
    poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1280&auto=format&fit=crop&q=80',
    year: 2023,
    rating: 8.9,
    genres: ['Биография', 'Драма', 'История'],
    type: 'movie',
    duration: '180 мин.'
  },
  {
    id: 'm-2',
    title: 'Интерстеллар',
    originalTitle: 'Interstellar',
    url: '/films/fiction/interstellar.html',
    poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1280&auto=format&fit=crop&q=80',
    year: 2014,
    rating: 8.6,
    genres: ['Фантастика', 'Драма', 'Приключения'],
    type: 'movie',
    duration: '169 мин.'
  },
  {
    id: 'm-3',
    title: 'Бегущий по лезвию 2049',
    originalTitle: 'Blade Runner 2049',
    url: '/films/fiction/blade-runner-2049.html',
    poster: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1280&auto=format&fit=crop&q=80',
    year: 2017,
    rating: 8.0,
    genres: ['Фантастика', 'Детектив', 'Драма'],
    type: 'movie',
    duration: '164 мин.'
  },
  {
    id: 'm-4',
    title: 'Темный рыцарь',
    originalTitle: 'The Dark Knight',
    url: '/films/action/the-dark-knight.html',
    poster: 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=1280&auto=format&fit=crop&q=80',
    year: 2008,
    rating: 9.0,
    genres: ['Боевик', 'Криминал', 'Драма'],
    type: 'movie',
    duration: '152 мин.'
  },
  {
    id: 'm-5',
    title: 'Начало',
    originalTitle: 'Inception',
    url: '/films/fiction/inception.html',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&auto=format&fit=crop&q=80',
    year: 2010,
    rating: 8.8,
    genres: ['Фантастика', 'Боевик', 'Триллер'],
    type: 'movie',
    duration: '148 мин.'
  },
  {
    id: 'm-6',
    title: 'Джентльмены',
    originalTitle: 'The Gentlemen',
    url: '/films/comedy/the-gentlemen.html',
    poster: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=1280&auto=format&fit=crop&q=80',
    year: 2019,
    rating: 8.5,
    genres: ['Криминал', 'Комедия', 'Боевик'],
    type: 'movie',
    duration: '113 мин.'
  }
];

export const MOCK_POPULAR_SERIES: MediaItem[] = [
  {
    id: 's-1',
    title: 'Очень странные дела',
    originalTitle: 'Stranger Things',
    url: '/series/fiction/stranger-things.html',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&auto=format&fit=crop&q=80',
    year: 2016,
    rating: 8.7,
    genres: ['Фантастика', 'Ужасы', 'Драма'],
    type: 'series',
    episodesCount: '4 сезона, 34 серии'
  },
  {
    id: 's-2',
    title: 'Пацаны',
    originalTitle: 'The Boys',
    url: '/series/action/the-boys.html',
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1280&auto=format&fit=crop&q=80',
    year: 2019,
    rating: 8.7,
    genres: ['Боевик', 'Комедия', 'Фантастика'],
    type: 'series',
    episodesCount: '4 сезона, 32 серии'
  },
  {
    id: 's-3',
    title: 'Дом Дракона',
    originalTitle: 'House of the Dragon',
    url: '/series/fantasy/house-of-the-dragon.html',
    poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1280&auto=format&fit=crop&q=80',
    year: 2022,
    rating: 8.5,
    genres: ['Фэнтези', 'Боевик', 'Драма'],
    type: 'series',
    episodesCount: '2 сезона, 18 серий'
  },
  {
    id: 's-4',
    title: 'Во все тяжкие',
    originalTitle: 'Breaking Bad',
    url: '/series/drama/breaking-bad.html',
    poster: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1280&auto=format&fit=crop&q=80',
    year: 2008,
    rating: 9.5,
    genres: ['Криминал', 'Драма', 'Триллер'],
    type: 'series',
    episodesCount: '5 сезонов, 62 серии'
  }
];

export const MOCK_POPULAR_ANIME: MediaItem[] = [
  {
    id: 'a-1',
    title: 'Атака титанов',
    originalTitle: 'Attack on Titan',
    url: '/animation/anime/shingeki-no-kyojin.html',
    poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&auto=format&fit=crop&q=80',
    year: 2013,
    rating: 9.0,
    genres: ['Аниме', 'Боевик', 'Драма', 'Фэнтези'],
    type: 'anime',
    episodesCount: '4 сезона, 89 серий'
  },
  {
    id: 'a-2',
    title: 'Магическая битва',
    originalTitle: 'Jujutsu Kaisen',
    url: '/animation/anime/jujutsu-kaisen.html',
    poster: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1280&auto=format&fit=crop&q=80',
    year: 2020,
    rating: 8.6,
    genres: ['Аниме', 'Фэнтези', 'Боевик'],
    type: 'anime',
    episodesCount: '2 сезона, 47 серий'
  },
  {
    id: 'a-3',
    title: 'Клинок, рассекающий демонов',
    originalTitle: 'Demon Slayer: Kimetsu no Yaiba',
    url: '/animation/anime/demon-slayer.html',
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1280&auto=format&fit=crop&q=80',
    year: 2019,
    rating: 8.7,
    genres: ['Аниме', 'Боевик', 'Фэнтези'],
    type: 'anime',
    episodesCount: '4 сезона, 55 серий'
  }
];

export const MOCK_CARTOONS: MediaItem[] = [
  {
    id: 'c-1',
    title: 'Человек-паук: Паутина вселенных',
    originalTitle: 'Spider-Man: Across the Spider-Verse',
    url: '/cartoons/spider-man-across-the-spider-verse.html',
    poster: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1635805737707-575885ab0820?w=1280&auto=format&fit=crop&q=80',
    year: 2023,
    rating: 8.9,
    genres: ['Мультфильм', 'Боевик', 'Приключения', 'Фантастика'],
    type: 'cartoon',
    duration: '140 мин.'
  },
  {
    id: 'c-2',
    title: 'Тайна Коко',
    originalTitle: 'Coco',
    url: '/cartoons/coco.html',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1280&auto=format&fit=crop&q=80',
    year: 2017,
    rating: 8.4,
    genres: ['Мультфильм', 'Фэнтези', 'Комедия'],
    type: 'cartoon',
    duration: '105 мин.'
  }
];

export function getMockDetails(id: string): MediaDetails {
  const allItems = [...MOCK_HERO_ITEMS, ...MOCK_POPULAR_MOVIES, ...MOCK_POPULAR_SERIES, ...MOCK_POPULAR_ANIME, ...MOCK_CARTOONS];
  const item = allItems.find(x => x.id === id) || MOCK_HERO_ITEMS[0];
  const isSeries = item.type === 'series' || item.type === 'anime';

  return {
    ...item,
    description: item.details || `${item.title} — захватывающее произведение киноискусства с потрясающей актерской игрой, глубоким сюжетом и выдающимися визуальными эффектами. В центре сюжета — преодоление сложнейших препятствий, испытание дружбы, преданности и человечности перед лицом неизвестности.`,
    directors: ['Дени Вильнёв', 'Кристофер Нолан'],
    actors: ['Тимоти Шаламе', 'Зендея', 'Ребекка Фергюсон', 'Хавьер Бардем', 'Джош Бролин', 'Остин Батлер'],
    ageRating: '16+',
    translators: [
      { id: '1', name: 'Дубляж (HDRezka Studio)' },
      { id: '2', name: 'LostFilm' },
      { id: '3', name: 'Кубик в Кубе' },
      { id: '4', name: 'Оригинал (+субтитры)' }
    ],
    seasons: isSeries ? [
      {
        id: 'season-1',
        seasonNumber: 1,
        title: 'Сезон 1',
        episodes: [
          { id: 'ep-1-1', seasonNumber: 1, episodeNumber: 1, title: 'Серия 1: Начало пути', duration: '58 мин.' },
          { id: 'ep-1-2', seasonNumber: 1, episodeNumber: 2, title: 'Серия 2: Испытание огнем', duration: '52 мин.' },
          { id: 'ep-1-3', seasonNumber: 1, episodeNumber: 3, title: 'Серия 3: Долгое эхо', duration: '64 мин.' },
          { id: 'ep-1-4', seasonNumber: 1, episodeNumber: 4, title: 'Серия 4: В осаде', duration: '50 мин.' },
          { id: 'ep-1-5', seasonNumber: 1, episodeNumber: 5, title: 'Серия 5: Точка невозврата', duration: '55 мин.' }
        ]
      },
      {
        id: 'season-2',
        seasonNumber: 2,
        title: 'Сезон 2',
        episodes: [
          { id: 'ep-2-1', seasonNumber: 2, episodeNumber: 1, title: 'Серия 1: Новый рассвет', duration: '60 мин.' },
          { id: 'ep-2-2', seasonNumber: 2, episodeNumber: 2, title: 'Серия 2: Тени прошлого', duration: '53 мин.' },
          { id: 'ep-2-3', seasonNumber: 2, episodeNumber: 3, title: 'Серия 3: Выбор судьбы', duration: '59 мин.' }
        ]
      }
    ] : undefined,
    similar: MOCK_POPULAR_MOVIES.slice(0, 4)
  };
}

export function getMockPlaybackSources(): PlaybackSource {
  return {
    streams: [
      { quality: '1080p Ultra', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { quality: '1080p', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { quality: '720p', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { quality: '480p', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { quality: '360p', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
    ],
    subtitles: [
      { language: 'Русский', url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles/subtitles-en.vtt' },
      { language: 'English', url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles/subtitles-en.vtt' }
    ],
    defaultQuality: '1080p'
  };
}
