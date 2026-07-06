FROM python:3.12-slim

WORKDIR /app

# Зависимости отдельным слоем для кэша
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bot/ ./bot/
COPY api/ ./api/
COPY migrations/ ./migrations/

CMD ["python", "-m", "bot.main"]
