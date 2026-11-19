# Правила проекта HDREZKA Desktop

## Версионирование и документация
- При любом обновлении версии приложения (в `package.json`, `src/shared/constants/index.ts`, `src/core/providers/rezka/provider.ts`) **всегда обновлять версию в `README.md`**:
  - Бейдж версии в шапке: `https://img.shields.io/badge/version-<версия>-crimson.svg`
  - Имена выходных файлов в разделе «Сборка дистрибутива»: `HDREZKA-Setup-<версия>.exe` и `HDREZKA-Portable-<версия>.exe`
- Все изменения версий и документации фиксировать в коммитах и синхронизировать с репозиторием.
