# Цветовая тема «9/10 рекомендуют» (Orbit Детский)

Готовый дизайн-пакет для переноса цветовой палитры в любой другой проект (CSS, Tailwind CSS, дизайн-система). Палитра основана на **чётком колор-блокингe** оригинальной упаковки жвачки Wrigley's Orbit Детский, а не на бледно-розовом «поросячьем» фоне.

---

## 1. Принцип распределения цветов (Color-Blocking 60 / 25 / 10 / 5)

Чтобы тема выглядела узнаваемо и сочно, соблюдайте строгую иерархию зон:

- **60% — Чистая белая этикетка (`#FDFCFE` / `#FFFFFF`)**: основной холст контента, карточки, формы, верхняя строка поиска.
- **25% — Насыщенный жвачный розовый хром (`#E31C79` → `#CC156D`)**: внешняя рамка приложения — шапка окна (`TitleBar`) и боковая навигационная панель (`Sidebar`) с **белым** текстом и иконками.
- **10% — Фирменный кобальт → небесно-голубой (`#164DA8` → `#36B6E5`)**: основные кнопки действий (CTA), активные вкладки, фокусные обводки, иконки-бейджи.
- **5% — Персиково-оранжевая дуга (`#F5A623`) и фольга (`#F1F6FC`)**: разделительные линии-свуши между розовой рамкой и белым холстом, звёзды/акценты и прохладные серебристо-голубые инпуты/подложки.

---

## 2. Таблица токенов палитры

| Роль | Hex | RGB | Применение |
|---|---|---|---|
| **Bubblegum Wrapper Pink** | `#E31C79` | `227, 28, 121` | Фон боковой панели, шапки окна, скроллбар, вторичные брендовые акценты |
| **Wrapper Magenta Deep** | `#CC156D` | `204, 21, 109` | Нижняя часть градиента боковой панели |
| **Orbit Cobalt Blue** | `#164DA8` | `22, 77, 168` | Начало градиента главных кнопок, активные пилюли, брендовые иконки |
| **Orbit Sky Cyan** | `#36B6E5` | `54, 182, 229` | Конец градиента кнопок, фокус-кольца, мягкие бейджи (`rgba(54,182,229,0.16)`) |
| **Peach-Orange Swoosh** | `#F5A623` | `245, 166, 35` | Контрастная полоса-разделитель (`2px–3px`) на стыке розового хрома и белого холста, рейтинги |
| **Crisp Label White** | `#FFFFFF` / `#FDFCFE` | `255, 255, 255` | Карточки, модалки, основной фон контента, текст на розовом и синем |
| **Calcium Cool Tint** | `#F1F6FC` | `241, 246, 252` | Вторичные поверхности, инпуты, hover-состояния на светлом (`#E5EFFB`) |
| **Foil Silver-Blush** | `#F3EEF4` | `243, 238, 244` | Базовый фон окна/подложки (`void`) |
| **Orbit Cobalt Ink** | `#0F2B66` | `15, 43, 102` | Основной высококонтрастный текст на белом (`#284785` вторичный, `#5A6F99` приглушённый) |

---

## 3. Готовые CSS-переменные (Drop-in CSS)

```css
[data-theme="orbit-9-of-10"] {
  color-scheme: light;

  /* Brand & Accents */
  --orbit-pink: #E31C79;
  --orbit-pink-deep: #CC156D;
  --orbit-pink-bright: #F03591;
  --orbit-cobalt: #164DA8;
  --orbit-cyan: #36B6E5;
  --orbit-peach: #F5A623;

  /* Surfaces (White Inner Label + Cool Calcium Tint) */
  --surface-void: #F3EEF4;
  --surface-canvas: #FDFCFE;
  --surface-panel: #FFFFFF;
  --surface-elevated: #F1F6FC;
  --surface-hover: #E5EFFB;

  /* Outer Chrome (Hot-Pink Gum Wrapper) */
  --chrome-bg: linear-gradient(180deg, #E31C79 0%, #CC156D 58%, #B4105F 100%);
  --chrome-bar-bg: linear-gradient(90deg, #D81874 0%, #E62482 55%, #EE3590 100%);
  --chrome-divider: #F5A623;
  --chrome-text: #FFFFFF;
  --chrome-text-muted: rgba(255, 240, 248, 0.84);

  /* Typography */
  --text-primary: #0F2B66;
  --text-secondary: #284785;
  --text-muted: #5A6F99;

  /* Borders & Interactive Gradients */
  --border-subtle: rgba(22, 77, 168, 0.14);
  --border-strong: rgba(22, 77, 168, 0.26);
  --gradient-primary: linear-gradient(135deg, #164DA8 0%, #1F6CE0 56%, #36B6E5 100%);
  --gradient-primary-hover: linear-gradient(135deg, #1C5BC2 0%, #2B7BF0 54%, #4EC8F2 100%);
  --badge-soft-bg: rgba(54, 182, 229, 0.16);
}

/* Пример применения колор-блокинга */
[data-theme="orbit-9-of-10"] .app-sidebar {
  background: var(--chrome-bg);
  color: var(--chrome-text);
  border-right: 3px solid var(--chrome-divider);
}

[data-theme="orbit-9-of-10"] .app-topbar {
  background: var(--chrome-bar-bg);
  color: var(--chrome-text);
  border-bottom: 2px solid var(--chrome-divider);
}

[data-theme="orbit-9-of-10"] .app-content {
  background:
    radial-gradient(ellipse 46% 34% at 96% 0%, rgba(227, 28, 121, 0.11), transparent 62%),
    radial-gradient(ellipse 44% 34% at 4% 8%, rgba(54, 182, 229, 0.15), transparent 60%),
    radial-gradient(ellipse 48% 36% at 88% 100%, rgba(245, 166, 35, 0.13), transparent 62%),
    var(--surface-canvas);
  color: var(--text-primary);
}

[data-theme="orbit-9-of-10"] .btn-primary {
  background: var(--gradient-primary);
  color: #FFFFFF;
  box-shadow: 0 10px 24px -6px rgba(22, 77, 168, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
```

---

## 4. Конфиг для Tailwind CSS (`tailwind.config.js`)

```js
// theme.extend.colors
orbit: {
  pink: '#E31C79',
  'pink-deep': '#CC156D',
  cobalt: '#164DA8',
  cyan: '#36B6E5',
  peach: '#F5A623',
  ink: '#0F2B66',
  'ink-muted': '#5A6F99',
  surface: '#FFFFFF',
  canvas: '#FDFCFE',
  calcium: '#F1F6FC',
  foil: '#F3EEF4',
}
```
