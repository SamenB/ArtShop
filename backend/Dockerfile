# Шаг 1: Указываем базовый образ (Base Image)
FROM python:3.12-slim

# Шаг 2: Создаем рабочую папку внутри контейнера
WORKDIR /app

# Шаг 3: Устанавливаем системные пакеты (нужны для Postgres и компиляции некоторых Python-библиотек)
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Шаг 4: Копируем ТОЛЬКО файл с зависимостями
COPY requirements.txt .

# Шаг 5: Устанавливаем Python-зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Шаг 6: Копируем весь остальный код бэкенда
COPY . .

# Шаг 7: Безопасность (создаем не-рут пользователя)
RUN useradd -m -d /app -s /bin/bash appuser \
    && chown -R appuser:appuser /app

# Шаг 8: Переключаемся на этого пользователя
USER appuser

# Шаг 9: Указываем порт (это просто документация для тех, кто читает Dockerfile)
EXPOSE 8000

# Step 10: Start FastAPI via uvicorn directly (correct prod pattern).
# host 0.0.0.0 = accept connections from outside the container.
# No --reload in prod (reload is for local dev only).
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
