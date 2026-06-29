FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/srv/aigentra/apps/api

WORKDIR /srv/aigentra

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh; \
    CODEX_BIN="$(PATH="/root/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH" command -v codex || true)"; \
    if [ -z "$CODEX_BIN" ]; then \
        CODEX_BIN="$(find /root /usr/local -type f -name codex -perm /111 2>/dev/null | head -n 1)"; \
    fi; \
    test -n "$CODEX_BIN"; \
    install -m 0755 "$CODEX_BIN" /usr/local/bin/codex; \
    /usr/local/bin/codex --version

RUN addgroup --system app && adduser --system --ingroup app app

COPY apps/api/requirements.txt apps/api/requirements.txt
RUN pip install --upgrade pip && pip install -r apps/api/requirements.txt

COPY alembic.ini alembic.ini
COPY apps/api/alembic apps/api/alembic
COPY apps/api/app apps/api/app

RUN mkdir -p apps/api/data .codex && chown -R app:app /srv/aigentra

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*' --workers ${API_WEB_CONCURRENCY:-2}"]
