# Flask API Dockerfile
# M-08 FIX: production-grade — gunicorn (not the flask dev server), non-root
# user, healthcheck, no debug.
FROM python:3.12-slim

# Non-root user (M-08: the old image ran as root)
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ .

RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser

# Expose API port
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health')" || exit 1

# M-08: gunicorn instead of `flask run` (the old comment claimed gunicorn but it
# was never installed). AUTH_TOKEN must be provided via the environment.
CMD ["gunicorn", "app:app", "--host=0.0.0.0", "--port=5000", "--workers=2", "--bind=0.0.0.0:5000"]
