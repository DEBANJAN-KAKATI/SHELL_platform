FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DASHBOARD_HOST=0.0.0.0 \
    DASHBOARD_PORT=5001 \
    DASHBOARD_OPEN_BROWSER=0 \
    DASHBOARD_SOURCE_DIRECTORY=/app/data/input \
    DASHBOARD_REACTOR_SOURCE_DIRECTORY=/app/data/input \
    DASHBOARD_RUN_PLAN_FILE=/app/data/RunPlan.xlsx

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

COPY . .
RUN mkdir -p /app/RunData /app/data/input /app/data/output /app/data/processed \
    && addgroup --system dashboard \
    && adduser --system --ingroup dashboard dashboard \
    && chown -R dashboard:dashboard /app

USER dashboard

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5001/login', timeout=3)"

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--access-logfile", "-", "app:app"]
