import {
  MediaItem,
  MediaDetails,
  StreamData,
  ContentType,
} from '../../../shared/types';

export const FALLBACK_HERO: MediaItem = {
  id: '56560',
  title: 'Дюна: Часть вторая',
  origTitle: 'Dune: Part Two',
  url: 'https://hdrezka.ag/films/fiction/56560-dyuna-chast-vtoraya-2024.html',
  poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1280&auto=format&fit=crop&q=80',
  year: 2024,
  country: 'США, Канада',
  genres: ['Фантастика', 'Боевик', 'Приключения', 'Драма'],
  type: 'films',
  rating: 8.5,
  info: 'Герцог Пол Атрейдес объединяется с фрименами, чтобы отомстить заговорщикам, уничтожившим его семью.',
};

export const FALLBACK_ITEMS: MediaItem[] = [
  FALLBACK_HERO,
  // --- SPIDER-MAN FRANCHISE ---
  {
    id: '1481',
    title: 'Человек-паук',
    origTitle: 'Spider-Man',
    url: 'https://hdrezka.ag/films/action/1481-chelovek-pauk-2002.html',
    poster: 'https://static.hdrezka.ac/i/2024/4/16/iecd60b88dcednc20p39y.jpeg',
    year: 2002,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 7.8,
    info: 'Школьник Питер Паркер обретает невероятные паучьи способности после укуса радиоактивного паука и встает на защиту Нью-Йорка от Зеленого Гоблина.',
  },
  {
    id: '1488',
    title: 'Человек-паук 2',
    origTitle: 'Spider-Man 2',
    url: 'https://hdrezka.ag/films/action/1488-chelovek-pauk-2-2004.html',
    poster: 'https://static.hdrezka.ac/i/2014/4/22/d8c895f87f269gm29b54o.jpg',
    year: 2004,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 7.4,
    info: 'Питер Паркер сталкивается с кризисом идентичности и гениальным ученым Доктором Осьминогом.',
  },
  {
    id: '1489',
    title: 'Человек-паук 3: Враг в отражении',
    origTitle: 'Spider-Man 3',
    url: 'https://hdrezka.ag/films/action/1489-chelovek-pauk-3-vrag-v-otrazhenii-2007.html',
    poster: 'https://static.hdrezka.ac/i/2014/4/22/ad5feb7322747lc76t13u.jpg',
    year: 2007,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 7.1,
    info: 'Питер Паркер поддается влиянию инопланетного симбиота и вступает в бой с Песочным человеком и Веномом.',
  },
  {
    id: '41670',
    title: 'LEGO Marvel Человек-Паук: Раздражённый Веномом',
    origTitle: 'Lego Marvel Spider-Man: Vexed by Venom',
    url: 'https://hdrezka.ag/cartoons/action/41670-lego-marvel-chelovek-pauk-razdrazhennyy-venomom-2019.html',
    poster: 'https://static.hdrezka.ac/i/2025/11/19/rb4eeea5368f1va15j91l.jpg',
    year: 2019,
    country: 'США',
    genres: ['Мультфильм', 'Боевик', 'Комедия'],
    type: 'cartoons',
    rating: 8.0,
    info: 'Веном и Зеленый Гоблин объединяются, чтобы похитить ценные технологии, но Человек-Паук готов дать отпор.',
  },
  {
    id: '11999',
    title: 'Человек-паук (мультсериал 1994)',
    origTitle: 'Spider-Man: The Animated Series',
    url: 'https://hdrezka.ag/cartoons/fiction/11999-chelovek-pauk-1994-latest.html',
    poster: 'https://static.hdrezka.ac/i/2023/8/18/q7e4e3fd525cenn28h33o.jpeg',
    year: 1994,
    country: 'США',
    genres: ['Мультфильм', 'Боевик', 'Фантастика'],
    type: 'cartoons',
    rating: 8.3,
    info: 'Культовый анимационный сериал о Питере Паркере, защищающем город от преступников и суперзлодеев.',
  },
  {
    id: '1490',
    title: 'Новый Человек-паук',
    origTitle: 'The Amazing Spider-Man',
    url: 'https://hdrezka.ag/films/action/1490-novyy-chelovek-pauk-2012.html',
    poster: 'https://static.hdrezka.ac/i/2021/6/7/v56338e55ec36fe27g62x.jpg',
    year: 2012,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 6.9,
    info: 'Питер Паркер пытается разгадать тайну исчезновения родителей и вступает в схватку с мутировавшим Ящером.',
  },
  {
    id: '23757',
    title: 'Человек-паук: Возвращение домой',
    origTitle: 'Spider-Man: Homecoming',
    url: 'https://hdrezka.ag/films/fiction/23757-chelovek-pauk-vozvraschenie-domoy-2017.html',
    poster: 'https://static.hdrezka.ac/i/2025/11/21/u2d6470b59a3bau68z17z.jpg',
    year: 2017,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 7.2,
    info: 'Питер Паркер пытается совмещать школьную жизнь с супергеройскими обязанностями под наставничеством Тони Старка.',
  },
  {
    id: '30985',
    title: 'Человек-паук: Вдали от дома',
    origTitle: 'Spider-Man: Far from Home',
    url: 'https://hdrezka.ag/films/action/30985-chelovek-pauk-vdali-ot-doma-2019.html',
    poster: 'https://static.hdrezka.ac/i/2019/7/4/z21855a73e5ccen66w26e.jpg',
    year: 2019,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 7.3,
    info: 'Питер Паркер отправляется на летние каникулы в Европу, где Ник Фьюри просит его помочь разобраться с Элементалями.',
  },
  {
    id: '43987',
    title: 'Человек-паук: Нет пути домой',
    origTitle: 'Spider-Man: No Way Home',
    url: 'https://hdrezka.ag/films/action/43987-chelovek-pauk-net-puti-domoy-2021.html',
    poster: 'https://static.hdrezka.ac/i/2021/12/16/e0a0d648bfeffiq59m25e.jpeg',
    year: 2021,
    country: 'США',
    genres: ['Боевик', 'Фантастика', 'Приключения'],
    type: 'films',
    rating: 8.0,
    info: 'Личность Человека-паука раскрыта. Чтобы все исправить, Питер обращается к Доктору Стрэнджу, что приводит к разлому мультивселенной.',
  },
  {
    id: '29372',
    title: 'Человек-паук: Через вселенные',
    origTitle: 'Spider-Man: Into the Spider-Verse',
    url: 'https://hdrezka.ag/cartoons/fiction/29372-spider-man-chelovek-pauk-cherez-vselennye-2018-latest.html',
    poster: 'https://static.hdrezka.ac/i/2021/5/28/z07528204071eig89y63c.jpg',
    year: 2018,
    country: 'США',
    genres: ['Мультфильм', 'Боевик', 'Приключения', 'Фантастика'],
    type: 'cartoons',
    rating: 8.2,
    info: 'Подросток Майлз Моралес становится новым Человеком-пауком и знакомится с альтернативными версиями героя из других вселенных.',
  },
  {
    id: '55673',
    title: 'Человек-паук: Паутина вселенных',
    origTitle: 'Spider-Man: Across the Spider-Verse',
    url: 'https://hdrezka.ag/cartoons/animation/spider-man-across-the-spider-verse.html',
    poster: 'https://static.hdrezka.ac/i/2023/6/5/a0840bfa6f332zg68z11a.jpg',
    year: 2023,
    country: 'США',
    genres: ['Мультфильм', 'Боевик', 'Приключения', 'Фантастика'],
    type: 'cartoons',
    rating: 8.9,
    info: 'Майлз Моралес отправляется в путешествие по мультивселенной, сталкиваясь с Обществом людей-пауков.',
  },

  // --- POPULAR MOVIES & SERIES ---
  {
    id: '55000',
    title: 'Оппенгеймер',
    origTitle: 'Oppenheimer',
    url: 'https://hdrezka.ag/films/drama/55000-oppengeymer-2023.html',
    poster: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=500&auto=format&fit=crop&q=80',
    year: 2023,
    country: 'США, Великобритания',
    genres: ['Биография', 'Драма', 'История'],
    type: 'films',
    rating: 8.9,
    info: 'История создания атомной бомбы физиком-теоретиком Робертом Оппенгеймером.',
  },
  {
    id: '2259',
    title: 'Интерстеллар',
    origTitle: 'Interstellar',
    url: 'https://hdrezka.ag/films/fiction/2259-interstellar-2014.html',
    poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&auto=format&fit=crop&q=80',
    year: 2014,
    country: 'США, Великобритания',
    genres: ['Фантастика', 'Драма', 'Приключения'],
    type: 'films',
    rating: 8.6,
    info: 'Группа исследователей отправляется через червоточину в поисках нового дома для человечества.',
  },
  {
    id: '43217',
    title: 'Бэтмен',
    origTitle: 'The Batman',
    url: 'https://hdrezka.ag/films/action/43217-betmen-2022.html',
    poster: 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=500&auto=format&fit=crop&q=80',
    year: 2022,
    country: 'США',
    genres: ['Боевик', 'Криминал', 'Детектив', 'Драма'],
    type: 'films',
    rating: 7.9,
    info: 'Брюс Уэйн на втором году борьбы с преступностью выходит на след безжалостного Загадочника.',
  },
  {
    id: 'dark-knight',
    title: 'Темный рыцарь',
    origTitle: 'The Dark Knight',
    url: 'https://hdrezka.ag/films/action/dark-knight.html',
    poster: 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=500&auto=format&fit=crop&q=80',
    year: 2008,
    country: 'США, Великобритания',
    genres: ['Боевик', 'Криминал', 'Драма'],
    type: 'films',
    rating: 9.0,
    info: 'Бэтмен поднимает ставки в войне с криминалом, сталкиваясь с хаотичным гением Джокера.',
  },
  {
    id: 'blade-runner-2049',
    title: 'Бегущий по лезвию 2049',
    origTitle: 'Blade Runner 2049',
    url: 'https://hdrezka.ag/films/fiction/2017-blade-runner-2049.html',
    poster: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=500&auto=format&fit=crop&q=80',
    year: 2017,
    country: 'США, Великобритания',
    genres: ['Фантастика', 'Детектив', 'Боевик'],
    type: 'films',
    rating: 8.0,
    info: 'Офицер полиции Кей раскрывает секрет, способный погрузить общество в хаос.',
  },
  {
    id: '43477',
    title: 'Аркейн',
    origTitle: 'Arcane: League of Legends',
    url: 'https://hdrezka.ag/cartoons/fiction/43477-arkein-2021-latest.html',
    poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
    year: 2021,
    country: 'США, Франция',
    genres: ['Мультфильм', 'Фантастика', 'Боевик', 'Драма'],
    type: 'cartoons',
    rating: 9.1,
    info: 'История двух сестер Вай и Джинкс на фоне вражды между утопическим Пилтовером и трущобами Зауна.',
  },
  {
    id: 'the-last-of-us',
    title: 'Одни из нас',
    origTitle: 'The Last of Us',
    url: 'https://hdrezka.ag/series/drama/51000-the-last-of-us-2023.html',
    poster: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80',
    year: 2023,
    country: 'США, Канада',
    genres: ['Драма', 'Фантастика', 'Боевик', 'Ужасы'],
    type: 'series',
    rating: 8.8,
    info: 'Закаленный контрабандист Джоэл сопровождает 14-летнюю Элли через постапокалиптическую Америку.',
  },
  {
    id: 'stranger-things',
    title: 'Очень странные дела',
    origTitle: 'Stranger Things',
    url: 'https://hdrezka.ag/series/fiction/stranger-things.html',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    year: 2022,
    country: 'США',
    genres: ['Фантастика', 'Ужасы', 'Драма', 'Детектив'],
    type: 'series',
    rating: 8.7,
    info: 'Таинственное исчезновение подростка в провинциальном городе открывает дверь в потусторонний мир.',
  },
  {
    id: 'breaking-bad',
    title: 'Во все тяжкие',
    origTitle: 'Breaking Bad',
    url: 'https://hdrezka.ag/series/drama/breaking-bad.html',
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=80',
    year: 2013,
    country: 'США',
    genres: ['Криминал', 'Драма', 'Триллер'],
    type: 'series',
    rating: 9.5,
    info: 'Учитель химии начинает варить метамфетамин ради будущего своей семьи.',
  },
  {
    id: 'attack-on-titan',
    title: 'Атака титанов',
    origTitle: 'Attack on Titan',
    url: 'https://hdrezka.ag/animation/anime/attack-on-titan.html',
    poster: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80',
    year: 2023,
    country: 'Япония',
    genres: ['Аниме', 'Боевик', 'Драма', 'Фэнтези'],
    type: 'animation',
    rating: 9.0,
    info: 'Остатки человечества борются против гигантских титанов-людоедов за стенами города.',
  },
  {
    id: 'cyberpunk-edgerunners',
    title: 'Киберпанк: Бегущие по краю',
    origTitle: 'Cyberpunk: Edgerunners',
    url: 'https://hdrezka.ag/animation/anime/cyberpunk-edgerunners.html',
    poster: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
    year: 2022,
    country: 'Япония, Польша',
    genres: ['Аниме', 'Фантастика', 'Боевик'],
    type: 'animation',
    rating: 8.4,
    info: 'История парня с улиц Найт-Сити, стремящегося выжить любой ценой.',
  },
  {
    id: 'coco-cartoon',
    title: 'Тайна Коко',
    origTitle: 'Coco',
    url: 'https://hdrezka.ag/cartoons/coco.html',
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    year: 2017,
    country: 'США',
    genres: ['Мультфильм', 'Фэнтези', 'Комедия'],
    type: 'cartoons',
    rating: 8.4,
    info: '12-летний Мигель отправляется в Страну Мертвых, чтобы разгадать семейную тайну.',
  },
];

export const FALLBACK_HOME_SECTIONS = {
  hero: FALLBACK_HERO,
  popular: FALLBACK_ITEMS.slice(0, 8),
  newReleases: FALLBACK_ITEMS.slice(1, 9),
  topMovies: FALLBACK_ITEMS.filter((i) => i.type === 'films'),
  topSeries: FALLBACK_ITEMS.filter((i) => i.type === 'series'),
  recommendations: FALLBACK_ITEMS.filter((i) => (i.rating || 0) >= 8.0),
  expected: FALLBACK_ITEMS.slice(2, 8),
};

const TRANSLIT_DICT: Record<string, string> = {
  chelovek: 'Человек',
  pauk: 'паук',
  vozvraschenie: 'Возвращение',
  domoy: 'домой',
  vdali: 'Вдали',
  ot: 'от',
  doma: 'дома',
  net: 'нет',
  puti: 'пути',
  novyy: 'Новый',
  vysokoe: 'Высокое',
  napryazhenie: 'напряжение',
  vrag: 'Враг',
  v: 'в',
  otrazhenii: 'отражении',
  razdrazhennyy: 'раздражённый',
  venomom: 'Веномом',
  cherez: 'Через',
  vselennye: 'вселенные',
  pautina: 'Паутина',
  vselennyh: 'вселенных',
  chast: 'Часть',
  vtoraya: 'вторая',
  pervaya: 'первая',
  tretya: 'третья',
  betmen: 'Бэтмен',
  oppengeymer: 'Оппенгеймер',
  dyuna: 'Дюна',
  interstellar: 'Интерстеллар',
  arkein: 'Аркейн',
};

function parseTitleFromUrlSlug(slug: string): string {
  // e.g. "1481-chelovek-pauk-2002" or "chelovek-pauk-2-2004"
  const clean = slug.replace(/\.html.*$/, '').replace(/^\d+-/, '');
  const words = clean.split('-').filter((w) => !/^\d{4}$/.test(w) && w !== 'latest');
  if (words.length === 0) return 'Фильм';

  const translated = words.map((w, idx) => {
    const low = w.toLowerCase();
    if (TRANSLIT_DICT[low]) {
      return idx === 0 ? TRANSLIT_DICT[low] : TRANSLIT_DICT[low].toLowerCase();
    }
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return translated.join(' ');
}

export function getFallbackDetails(urlOrId: string, meta?: Partial<MediaItem>): MediaDetails {
  const norm = (urlOrId || '').trim();
  const lower = norm.toLowerCase();

  // 1. Direct match by exact ID or URL
  let item = FALLBACK_ITEMS.find((i) => i.id === norm || i.url === norm);

  // 2. ID-based match (e.g. from /films/action/1481-chelovek-pauk-2002.html -> id 1481)
  if (!item && norm) {
    const idMatch = norm.match(/(?:^|\/)(\d+)(?:-|$)/);
    if (idMatch) {
      const parsedId = idMatch[1];
      item = FALLBACK_ITEMS.find((i) => i.id === parsedId || i.url.includes(`/${parsedId}-`));
    }
  }

  // 3. Keyword / slug match
  if (!item && norm) {
    if (lower.includes('chelovek-pauk') || lower.includes('spider-man') || lower.includes('spider_man') || lower.includes('паук') || lower.includes('pauk')) {
      const spidey = FALLBACK_ITEMS.filter((i) =>
        i.title.toLowerCase().includes('паук') || i.origTitle?.toLowerCase().includes('spider')
      );
      const yearMatch = norm.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) {
        const y = parseInt(yearMatch[1], 10);
        item = spidey.find((i) => i.year === y) || spidey[0];
      } else {
        item = spidey[0];
      }
    } else if (lower.includes('dyuna') || lower.includes('dune') || lower.includes('дюн')) {
      item = FALLBACK_HERO;
    } else if (lower.includes('betmen') || lower.includes('batman') || lower.includes('бэтмен')) {
      item = FALLBACK_ITEMS.find((i) => i.title.includes('Бэтмен'));
    }
  }

  // 4. Slug / URL fallback parsing (never default to Dune when asking for another movie!)
  const slug = norm.split('/').pop() || '';
  const parsedTitle = slug ? parseTitleFromUrlSlug(slug) : '';
  const yMatch = norm.match(/\b(19\d{2}|20\d{2})\b/);
  const parsedYear = yMatch ? parseInt(yMatch[1], 10) : undefined;

  let parsedType: ContentType = 'films';
  if (norm.includes('/series/')) parsedType = 'series';
  else if (norm.includes('/cartoons/')) parsedType = 'cartoons';
  else if (norm.includes('/animation/')) parsedType = 'animation';

  const isSpideyQuery = lower.includes('паук') || lower.includes('spider') || lower.includes('pauk');
  const fallbackTitle = isSpideyQuery ? 'Человек-паук' : 'Фильм';

  const title = meta?.title || item?.title || (parsedTitle && parsedTitle !== 'Фильм' ? parsedTitle : '') || fallbackTitle;
  const origTitle = meta?.origTitle || item?.origTitle || title;
  const year = meta?.year || item?.year || parsedYear || 2024;
  const type = meta?.type || item?.type || parsedType;
  const rating = meta?.rating || item?.rating || 7.8;
  const poster =
    meta?.poster ||
    item?.poster ||
    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=80';
  const isSeries =
    type === 'series' ||
    type === 'animation' ||
    (item?.type === 'cartoons' && (item.title.toLowerCase().includes('мультсериал') || item.title.includes('1994'))) ||
    lower.includes('мультсериал') ||
    lower.includes('сериал') ||
    norm.includes('series');
  const genres = item?.genres || ['Боевик', 'Приключения', 'Фантастика'];
  const description =
    meta?.info ||
    item?.info ||
    `«${title}» (${year}) — доступен для онлайн-просмотра в отличном качестве HDRezka с выбором профессиональной озвучки.`;

  const extractedId = meta?.id || item?.id || norm.match(/(?:^|\/)(\d+)(?:-|$)/)?.[1] || norm;

  const isSpiderMan = title.toLowerCase().includes('паук') || origTitle.toLowerCase().includes('spider');

  const similarItems = isSpiderMan
    ? FALLBACK_ITEMS.filter((i) => i.title.includes('паук') || (i.origTitle && i.origTitle.toLowerCase().includes('spider')))
    : FALLBACK_ITEMS.filter((i) => !i.title.includes('паук')).slice(0, 6);

  return {
    id: extractedId,
    url: meta?.url || item?.url || norm,
    title,
    origTitle,
    poster,
    backdrop: poster,
    year,
    country: item?.country || 'США',
    genres,
    type,
    duration: isSeries ? 'Сериал (серии ~45 мин.)' : '124 мин.',
    ageRating: '16+',
    ratingRezka: rating,
    ratingImdb: Number(Math.max(1, rating - 0.2).toFixed(1)),
    ratingKp: Number(Math.max(1, rating - 0.3).toFixed(1)),
    description,
    directors: isSpiderMan ? ['Сэм Рэйми', 'Джон Уоттс', 'Марк Уэбб'] : ['Сэм Рэйми', 'Кристофер Нолан'],
    actors: isSpiderMan ? ['Тоби Магуайр', 'Том Холланд', 'Эндрю Гарфилд', 'Зендея'] : ['Тоби Магуайр', 'Том Холланд', 'Зендея', 'Бенедикт Камбербэтч'],
    // Real translators are only known from the title page; never show made-up ones
    translators: [],
    currentTranslatorId: 56,
    seasons: isSeries
      ? [
          {
            id: 1,
            title: 'Сезон 1',
            episodes: [
              { id: 1, seasonId: 1, episodeId: 1, title: 'Серия 1: Начало' },
              { id: 2, seasonId: 1, episodeId: 2, title: 'Серия 2: Развитие' },
              { id: 3, seasonId: 1, episodeId: 3, title: 'Серия 3: Кульминация' },
              { id: 4, seasonId: 1, episodeId: 4, title: 'Серия 4: Финал' },
            ],
          },
        ]
      : undefined,
    similar: similarItems,
  };
}

export function getFallbackStream(): StreamData {
  return {
    streams: [],
    subtitles: [],
  };
}
