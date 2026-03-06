# === СТАДИЯ 1: Базовый образ и зависимости ===
FROM node:20-alpine AS base
WORKDIR /app

# Копируем ИСКЛЮЧИТЕЛЬНО файлы конфигурации пакетов (магия кеширования, помнишь?)
# package-lock.json критически важен для воспроизводимости версий
COPY package.json package-lock.json ./

# Устанавливаем зависимости чисто (ci = clean install)
# Это быстрее и надежнее, чем обычный npm install
RUN npm ci

# === СТАДИЯ 2: Среда для локальной разработки ===
# Мы используем её в docker-compose.yml для Hot Reloading
FROM base AS development
WORKDIR /app

# Мы НЕ копируем код здесь через COPY,
# потому что локальный код будет "пробрасываться" через volume в docker-compose.yml,
# чтобы React (Next.js) видел твои сохранения файлов в реальном времени.

# Просто задаем дефолтную команду запуска сервера разработки
CMD ["npm", "run", "dev"]
