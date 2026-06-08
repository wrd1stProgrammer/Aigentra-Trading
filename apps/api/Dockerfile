FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/srv/aigentra/apps/api

WORKDIR /srv/aigentra

RUN addgroup --system app && adduser --system --ingroup app app

COPY apps/api/requirements.txt apps/api/requirements.txt
RUN pip install --upgrade pip && pip install -r apps/api/requirements.txt

COPY alembic.ini alembic.ini
COPY apps/api/alembic apps/api/alembic
COPY apps/api/app apps/api/app

RUN mkdir -p apps/api/data && chown -R app:app /srv/aigentra

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
