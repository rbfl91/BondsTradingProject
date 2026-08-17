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

# N-01 FIX: the ABI artifact used to be resolved from the repo root, which does
# NOT exist inside the image (only api/ was copied) — `get_contract_abi()`
# missed both candidate paths, `contract` stayed None and every /bond/*
# endpoint 500'd with "ABI artifact missing". The compiled artifact is now
# copied into the image; the resolver also honours the CONTRACT_ABI_PATH /
# CONTRACT_ABI environment override. Build from the repo root:
#   npm run build          # (re)generate artifacts/ after contract changes
#   docker build -f api/Dockerfile -t bond-api .
COPY artifacts/ /app/artifacts/

RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser

# Expose API port
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health')" || exit 1

# M-08: gunicorn instead of `flask run` (the old comment claimed gunicorn but it
# was never installed). AUTH_TOKEN must be provided via the environment.
# N-01: the redundant --host/--bind pair is collapsed to a single --bind.
# N-14: gunicorn.conf.py runs validate_config() at startup, so a missing
# AUTH_TOKEN fails fast (same as `python app.py`), not silently per-route.
CMD ["gunicorn", "app:app", "--config", "gunicorn.conf.py", "--bind=0.0.0.0:5000", "--workers=2"]
