# Flask API Dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ .

# Expose API port
EXPOSE 5000

# Run with gunicorn for production (or flask for dev)
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
