FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/docker-entrypoint.sh

ENV PORT=8080 \
    PYTHONUNBUFFERED=1 \
    DB_PATH=/data/trading_platform.db

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "app:app", "--workers", "2", "--threads", "4", "--timeout", "120", "--bind", "0.0.0.0:8080"]
