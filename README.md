# AI Trader League

AI Trader League 1차 기술 데모입니다. BTCUSDT, ETHUSDT를 대상으로 Binance USD-M Futures public market data를 호출하고, 5개 AI 트레이더 전략이 market snapshot, candidate trade, AI review, paper trade plan 흐름을 검증합니다.

이 저장소는 실제 매매용이 아닙니다. Binance private API, 계좌 연동, 실제 거래소 주문 생성, 출금/입금, 실제 거래소 포지션 변경 기능은 구현하지 않았습니다. 생성되는 주문/포지션은 모두 내부 DB의 paper trading 시뮬레이션 데이터입니다.

## 구조

```text
.
├── apps/
│   ├── api/    # FastAPI backend
│   └── web/    # Next.js frontend
├── package.json
├── README.md
└── .gitignore
```

Step 2에서는 backend에 SQLite 기반 저장소를 둡니다. 기본 DB 파일은 `apps/api/data/dev.db`이며, run cycle 실행 결과와 AI review, paper trade plan 확인에 사용합니다. 이 DB는 로컬 개발용입니다.

Step 3에서는 승인된 trade plan을 실제 거래소 주문이 아니라 `paper_orders`, `paper_positions`, `trade_events`, `equity_snapshots`에 저장하는 paper trading engine과 연결했습니다. 5개 트레이더는 활성 paper 주문/포지션이 있으면 새 후보를 반복 생성하지 않고 관리 모드로 전환합니다.

Step 4에서는 활성 paper 주문/포지션을 관리하는 Position Management AI를 추가했습니다. hard TP/SL/수수료/PnL 처리는 paper engine이 먼저 수행하고, 남아 있는 대기 주문 또는 오픈 포지션에 대해 트레이더별 관리 이벤트가 발생하면 AI가 취소, 손절 상향/하향 조정, 부분익절, 위험 축소, 조기종료 중 하나를 paper 상태에만 적용합니다.

Step 5에서는 Position Management AI를 v2 agent 방식으로 확장했습니다. 이제 특정 이벤트가 없어도 활성 대기 주문과 오픈 포지션은 기본 5분마다 AI heartbeat 리뷰를 수행하고 `trader_agent_states`에 현재 agent mode, phase, 다음 리뷰 예정시각, 마지막 판단을 저장합니다.

현재 데모 UI는 `/traders`와 `/traders/[id]`에서 TradingView Lightweight Charts 기반 공통 캔들 차트를 표시합니다. 기본 타임프레임은 `1h`이며, `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w`를 전환할 수 있습니다. run-cycle 후 candidate가 생성되고 AI review가 승인 또는 수정승인하면 생성된 paper trade plan의 진입, 손절, 익절 가격이 차트에 price line으로 표시됩니다.

## 환경변수

Backend:

```bash
cp apps/api/.env.example apps/api/.env
```

기본값은 mock AI provider입니다.

```dotenv
APP_ENV=local
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
BINANCE_FUTURES_BASE_URL=https://fapi.binance.com
DATABASE_URL=sqlite:///./data/dev.db
NEON_DATABASE_URL=
ALLOW_REMOTE_DATABASE_IN_LOCAL=false
PAPER_DEFAULT_EQUITY=10000
PAPER_MAKER_FEE_RATE=0.0002
PAPER_TAKER_FEE_RATE=0.0005
PAPER_SLIPPAGE_RATE=0.0001
PAPER_MAX_LEVERAGE=10
PAPER_MAX_ACTIVE_POSITIONS_PER_TRADER=1
ENABLE_AUTO_SCANNER=false
AUTO_SCANNER_SYMBOLS=BTCUSDT
AUTO_SCANNER_INTERVAL_SECONDS=60
AUTO_SCANNER_PROVIDER=mock
AUTO_SCANNER_LOCALE=ko
AUTO_SCANNER_SNAPSHOT_CONCURRENCY=3
AUTO_SCANNER_AI_CONCURRENCY=2
AI_REJECTION_COOLDOWN_SECONDS=300
ENABLE_POSITION_MANAGEMENT_AI=true
POSITION_MANAGEMENT_PROVIDER=mock
POSITION_MANAGEMENT_COOLDOWN_SECONDS=300
POSITION_MANAGEMENT_MAX_REVIEWS_PER_CYCLE=2
POSITION_MANAGEMENT_PENDING_HEARTBEAT_SECONDS=300
POSITION_MANAGEMENT_OPEN_HEARTBEAT_SECONDS=300
POSITION_MANAGEMENT_URGENT_COOLDOWN_SECONDS=60
AI_PROVIDER=mock
AI_MISSING_KEY_FALLBACK_TO_MOCK=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
```

선택 provider를 쓰려면 `AI_PROVIDER`를 `openai`, `gemini`, `anthropic`, `grok` 중 하나로 바꾸고 해당 API key/model만 `.env`에 넣습니다. 키가 없으면 기본 설정에서는 mock provider로 fallback합니다.

Frontend:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

실제 API key는 `.env`, `.env.local`에만 넣고 커밋하지 마세요.

## DB 초기화와 Neon 전환

기본 SQLite DB 위치:

```text
apps/api/data/dev.db
```

Backend 가상환경에서 DB를 초기화합니다.

```bash
cd apps/api
source .venv/bin/activate
python -c "from app.db import init_db; init_db()"
```

초기화 후 파일이 생성되었는지 확인합니다.

```bash
ls -lh data/dev.db
```

다른 DB 위치를 쓰려면 `apps/api/.env`의 `DATABASE_URL`을 바꿉니다.

```dotenv
DATABASE_URL=sqlite:///./data/dev.db
```

위 값은 `apps/api` 디렉터리에서 backend를 실행하는 기준입니다. 환경변수를 비워 두면 앱의 기본값으로 `apps/api/data/dev.db`를 사용합니다.

Neon/Postgres를 쓰려면 `apps/api/.env`에 아래 둘 중 하나를 설정합니다. `NEON_DATABASE_URL`만 채워도 동작하며, `DATABASE_URL`을 직접 Postgres URL로 바꿔도 됩니다.

```dotenv
DATABASE_URL=
NEON_DATABASE_URL=
```

Neon URL은 Neon Console의 프로젝트에서 `Connection string` 또는 `Pooled connection string`에서 확인합니다. 값은 보통 `postgresql://...` 형태입니다. 실제 비밀번호가 들어 있으므로 README, 코드, 채팅 로그, 커밋에 노출하지 마세요.

로컬 개발에서는 `APP_ENV=local`일 때 원격 Postgres/Neon URL이 `.env`에 남아 있어도 기본적으로 `apps/api/data/dev.db`로 우회합니다. Neon 전송량을 실수로 태우는 것을 막기 위한 안전장치입니다. 운영 DB를 실제로 쓰려면 아래처럼 명시적으로 전환합니다.

```dotenv
APP_ENV=production
DATABASE_URL=postgresql://...
ALLOW_REMOTE_DATABASE_IN_LOCAL=false
```

로컬에서 Neon 연결 자체를 테스트해야 하는 경우에만 임시로 아래 값을 켭니다. 테스트 후 다시 `false`로 되돌리세요.

```dotenv
APP_ENV=local
ALLOW_REMOTE_DATABASE_IN_LOCAL=true
```

운영 DB 연결과 저장 정책은 아래 endpoint로 확인합니다. URL은 마스킹되어 반환됩니다.

```bash
curl -s http://localhost:8000/api/db/status | jq
curl -s http://localhost:8000/api/ops/storage-policy | jq
```

현재 저장 정책은 다음과 같습니다.

- `market_snapshots`: run-cycle 감사용 compact summary만 저장합니다. 일반 `/api/binance/market-snapshot` 조회는 기본적으로 DB에 쓰지 않습니다.
- `trader_run_logs`: market snapshot 전체 원문을 중복 저장하지 않고, candidate/review/plan 요약과 record id만 저장합니다.
- `provider_call_logs`: provider, model, success, latency, decision, error 요약만 저장하고 API key나 prompt 전문은 저장하지 않습니다.
- 캔들/차트 데이터: Neon에 저장하지 않고 backend memory cache + Binance public API로 처리합니다. 운영에서 더 키우려면 같은 서버의 로컬 Redis를 1차 캐시로 두고, Neon은 계정/결제/최종 거래 이력/리더보드 read model만 맡기는 구조가 비용 효율적입니다.

시장 데이터 캐시 상태는 아래 endpoint로 확인합니다.

```bash
curl -s http://localhost:8000/api/market/cache/status | jq
```

운영 배포에서는 같은 EC2 안의 Redis 컨테이너를 market data TTL cache로 사용합니다. 캔들, OI, funding, long/short, taker volume 같은 hot market data는 Neon에 저장하지 않습니다. API와 worker 컨테이너가 같은 Redis를 공유하므로 첫 요청 이후 같은 타임프레임/심볼 요청은 Redis에서 빠르게 반환됩니다.

Alembic은 DB 테이블 구조를 버전으로 관리하는 migration 도구입니다. SQLite 로컬 개발은 앱 시작 시 `init_db()`로 자동 테이블 생성이 되지만, Neon처럼 공유 Postgres DB를 쓸 때는 migration으로 구조를 올리는 방식이 안전합니다. Postgres/Neon에서는 앱 시작 시 자동 `create_all`을 실행하지 않도록 해 두었습니다.

```bash
cd /Users/sikgates/Desktop/ai-trader-league
source apps/api/.venv/bin/activate
alembic -c alembic.ini upgrade head
```

리더보드 성능용 read-model은 `trader_leaderboard_snapshots` 테이블에 저장됩니다. Neon에 아직 migration이 적용되지 않은 상태에서도 UI는 계산 fallback으로 동작하지만, 매번 집계하므로 느립니다. 빠른 리더보드를 쓰려면 위 `upgrade head`를 먼저 실행하세요.

이미 FastAPI를 먼저 실행해서 Neon에 테이블이 자동 생성된 적이 있다면 `upgrade head`가 `DuplicateTable`로 막힐 수 있습니다. 이 경우 기존 스키마를 현재 migration head로 등록합니다.

```bash
alembic -c alembic.ini stamp head
alembic -c alembic.ini current
alembic -c alembic.ini upgrade head
```

초기 개발 중 DB를 다시 만들고 싶을 때만 주의해서 downgrade를 사용합니다.

```bash
alembic -c alembic.ini downgrade base
```

## Backend Production 배포

이번 프로덕션 백엔드 구조는 아래 흐름입니다.

```text
GitHub main push
→ GitHub Actions
→ Docker image build/push to Docker Hub
→ EC2 SSH 접속
→ /opt/aigentra-trading/docker-compose.yml 갱신
→ docker compose pull
→ Alembic migration
→ api / worker / redis 재기동
```

런타임 역할은 분리되어 있습니다.

- `api`: FastAPI HTTP API만 담당합니다. 운영 compose에서는 `ENABLE_AUTO_SCANNER=false`로 고정해 API 프로세스가 자동 감시를 직접 돌리지 않습니다.
- `worker`: `python -m app.worker`로 실행되며 1분 스캐너와 paper position management loop를 담당합니다.
- `redis`: Binance public market data TTL cache입니다. persistence 없이 `allkeys-lru`로 운용하므로 디스크와 Neon 전송량을 늘리지 않습니다.
- `migrate`: 배포마다 `alembic upgrade head`를 1회 실행하는 일회성 컨테이너입니다.

### EC2 최초 설치

Amazon Linux EC2에서는 아래를 실행합니다. 접속 사용자가 `ec2-user`인 인스턴스는 대부분 이 경로입니다.

```bash
curl -fsSL https://raw.githubusercontent.com/wrd1stProgrammer/Aigentra-Trading/main/deploy/ec2/bootstrap-amazon-linux.sh -o bootstrap-amazon-linux.sh
bash bootstrap-amazon-linux.sh
exit
```

다시 SSH 접속한 뒤 확인합니다.

```bash
docker --version
docker compose version
nginx -v
certbot --version
```

Ubuntu 계열 EC2에서는 아래를 실행합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/wrd1stProgrammer/Aigentra-Trading/main/deploy/ec2/bootstrap-ubuntu.sh -o bootstrap-ubuntu.sh
bash bootstrap-ubuntu.sh
exit
```

다시 SSH 접속한 뒤 확인합니다.

```bash
docker --version
docker compose version
nginx -v
certbot --version
```

### EC2 원격 환경 파일

EC2에 배포 디렉터리를 만들고 예시 env를 복사합니다.

```bash
sudo mkdir -p /opt/aigentra-trading
sudo chown $USER:$USER /opt/aigentra-trading
cd /opt/aigentra-trading
```

`deploy/ec2/production.env.example` 내용을 기준으로 `/opt/aigentra-trading/.env`를 직접 만듭니다. 실제 키는 Git에 넣지 않습니다.

필수로 채울 값:

- `DATABASE_URL`: Neon pooled connection string. 운영에서는 `postgresql://...sslmode=require` 형태를 넣습니다.
- `CORS_ORIGINS`: 프론트 배포 전에는 임시로 `https://aigentra-trading.nostalgia-drive.com` 또는 테스트할 origin을 넣습니다.
- `GEMINI_API_KEY`: Gemini provider를 쓸 경우 필요합니다.
- `GEMINI_MODEL`: 실제 사용 가능한 Gemini 모델명입니다.
- `SUBSCRIBER_API_TOKEN`: 구독/알림 API 보호용 내부 토큰을 쓸 경우 설정합니다.
- `TELEGRAM_BOT_TOKEN`: Telegram 알림을 실제 발송할 경우 설정합니다.

기본 추천값:

```dotenv
APP_ENV=production
REDIS_URL=redis://redis:6379/0
REDIS_MARKET_CACHE_ENABLED=true
ENABLE_AUTO_SCANNER=true
AUTO_SCANNER_SYMBOLS=BTCUSDT
AUTO_SCANNER_INTERVAL_SECONDS=60
AUTO_SCANNER_PROVIDER=gemini
POSITION_MANAGEMENT_PROVIDER=gemini
EQUITY_SNAPSHOT_INTERVAL_SECONDS=300
EQUITY_SNAPSHOT_MIN_CHANGE_PERCENT=0.03
```

### Nginx와 HTTPS

Route53에서 `aigentra-trading.nostalgia-drive.com`이 EC2 탄력 IP를 가리키고 있다면 Nginx 설정을 넣습니다.

Amazon Linux:

```bash
sudo cp /opt/aigentra-trading/nginx-api.conf.example /etc/nginx/conf.d/aigentra-trading.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d aigentra-trading.nostalgia-drive.com
```

Ubuntu:

```bash
sudo cp /opt/aigentra-trading/nginx-api.conf.example /etc/nginx/sites-available/aigentra-trading
sudo ln -sf /etc/nginx/sites-available/aigentra-trading /etc/nginx/sites-enabled/aigentra-trading
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d aigentra-trading.nostalgia-drive.com
```

현재 구성은 백엔드 API를 해당 도메인 루트에 붙입니다. 나중에 프론트를 Vercel에 올릴 예정이면 권장 구조는 `api.aigentra-trading.nostalgia-drive.com`을 백엔드에 쓰고, `aigentra-trading.nostalgia-drive.com`은 Vercel 프론트에 연결하는 방식입니다.

### GitHub Actions Secrets

GitHub repo `wrd1stProgrammer/Aigentra-Trading`의 Settings → Secrets and variables → Actions에 아래 값을 넣습니다.

- `DOCKERHUB_USERNAME`: Docker Hub 사용자명
- `DOCKERHUB_TOKEN`: Docker Hub access token
- `EC2_HOST`: EC2 public DNS 또는 탄력 IP
- `EC2_USER`: Amazon Linux AMI면 `ec2-user`, Ubuntu AMI면 `ubuntu`
- `EC2_SSH_KEY`: EC2 접속용 private key 전체 내용

Docker Hub repository는 Actions가 push할 수 있어야 합니다. 기본 이미지명은 아래입니다.

```text
<DOCKERHUB_USERNAME>/aigentra-trading-api
```

### 수동 배포 테스트

Actions 전에 EC2에서 compose만 먼저 확인하려면 아래를 실행합니다.

```bash
cd /opt/aigentra-trading
docker compose pull
docker compose run --rm migrate
docker compose up -d api worker redis
docker compose ps
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/api/market/cache/status
```

로그 확인:

```bash
docker compose logs -f api
docker compose logs -f worker
docker compose logs --tail=100 redis
```

### 운영 최적화 원칙

- 캔들/차트 데이터는 Neon에 저장하지 않습니다. Binance public API → Redis TTL cache → API 응답 순서로 처리합니다.
- Neon에는 계정/구독/트레이더 상태/paper order/position/trade event/leaderboard read model처럼 영속성이 필요한 데이터만 저장합니다.
- `equity_snapshots`는 매 틱 저장하지 않고 `EQUITY_SNAPSHOT_INTERVAL_SECONDS`와 `EQUITY_SNAPSHOT_MIN_CHANGE_PERCENT` 조건을 통과하거나 체결/청산 이벤트가 있을 때만 저장합니다.
- API 컨테이너와 worker 컨테이너를 분리해 화면 요청 부하와 자동 감시 부하가 서로 영향을 덜 주게 합니다.
- Redis는 같은 EC2 안에서만 접근하게 두고 외부 포트를 열지 않습니다.

## 설치

Backend:

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Frontend:

```bash
cd apps/web
npm install
```

또는 루트에서 workspace install:

```bash
npm install
```

## 실행

Backend:

```bash
cd apps/api
source .venv/bin/activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd apps/web
npm run dev
```

루트에서 실행:

```bash
npm run web:dev
```

## 확인 URL

- Frontend dashboard: `http://localhost:3000`
- Trader list: `http://localhost:3000/traders`
- Technical tests: `http://localhost:3000/tests`
- Backend health: `http://localhost:8000/health`
- Backend docs: `http://localhost:8000/docs`
- Binance test endpoint: `http://localhost:8000/api/binance/test`
- Market snapshot: `http://localhost:8000/api/binance/market-snapshot?symbol=BTCUSDT`

## Backend API

주요 endpoint:

```text
GET  /health
GET  /api/binance/test
GET  /api/binance/klines?symbol=BTCUSDT&interval=1m&limit=20
GET  /api/binance/open-interest?symbol=BTCUSDT
GET  /api/binance/market-snapshot?symbol=BTCUSDT
GET  /api/traders
GET  /api/traders/{trader_id}
POST /api/traders/{trader_id}/run-cycle
POST /api/traders/{trader_id}/run-cycle?provider=gemini
POST /api/demo/run-all-traders
GET  /api/db/status
GET  /api/runs
GET  /api/runs/{run_id}
GET  /api/market-snapshots
GET  /api/candidate-trades
GET  /api/ai/reviews
GET  /api/trade-plans
GET  /api/provider-calls
GET  /api/paper/trader-states
GET  /api/paper/orders
GET  /api/paper/positions
GET  /api/paper/positions/active
GET  /api/paper/events
GET  /api/paper/management-reviews
GET  /api/position-management/reviews
GET  /api/paper/agent-states
GET  /api/agent-states
GET  /api/paper/equity-snapshots
GET  /api/paper/risk-settings
POST /api/paper/engine/run-once
GET  /api/league/leaderboard-fast
POST /api/league/leaderboard-snapshots/refresh
GET  /api/ai/providers
POST /api/ai/review-demo
POST /api/ai/review-demo?provider=gemini
```

Run cycle 예시:

```bash
curl -X POST http://localhost:8000/api/traders/channel-rider/run-cycle \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","locale":"ko"}'
```

승인 또는 수정승인된 run-cycle은 `trade_plans`뿐 아니라 `paper_orders`도 생성합니다. 실제 거래소 주문은 발생하지 않습니다.

응답에서 다음 필드를 확인합니다.

```bash
curl -s -X POST http://localhost:8000/api/traders/channel-rider/run-cycle \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","locale":"ko"}' | jq '{traderId, symbol, candidate, aiReview, tradePlan}'
```

Paper engine을 한 번 실행하면 현재 1분봉 OHLC 기준으로 open paper order fill, TP/SL 종료, 수수료, 실현/미실현 손익, equity snapshot을 갱신합니다.
hard risk 처리 후에도 대기 주문/오픈 포지션이 남아 있으면 Position Management AI가 paper 주문 취소, stop tighten, 부분익절, 조기종료 등을 검토합니다. 급변 이벤트가 없더라도 heartbeat 시간이 지나면 AI가 능동적으로 현재 exposure를 재평가합니다.

```bash
curl -s -X POST http://localhost:8000/api/paper/engine/run-once \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","locale":"ko"}' | jq
```

저장된 paper 상태 확인:

```bash
curl -s http://localhost:8000/api/paper/trader-states | jq
curl -s 'http://localhost:8000/api/paper/orders?symbol=BTCUSDT' | jq
curl -s 'http://localhost:8000/api/paper/positions/active?symbol=BTCUSDT' | jq
curl -s 'http://localhost:8000/api/paper/events?symbol=BTCUSDT' | jq
curl -s 'http://localhost:8000/api/paper/management-reviews?symbol=BTCUSDT' | jq
curl -s 'http://localhost:8000/api/paper/agent-states?symbol=BTCUSDT' | jq
curl -s http://localhost:8000/api/paper/equity-snapshots | jq
```

전체 trader run cycle을 한 번에 실행합니다.

```bash
curl -s -X POST http://localhost:8000/api/demo/run-all-traders \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","locale":"ko"}' | jq
```

Gemini를 명시적으로 테스트하려면 query string으로 provider를 지정합니다. 이 호출은 실제 Gemini API를 사용할 수 있으므로 과금/쿼터에 주의하세요.

```bash
curl -s -X POST 'http://localhost:8000/api/ai/review-demo?provider=gemini' \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","locale":"ko"}' | jq '{runId, aiReview, tradePlan}'

curl -s -X POST 'http://localhost:8000/api/traders/channel-rider/run-cycle?provider=gemini' \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","locale":"ko"}' | jq '{runId, recordIds, aiReview, tradePlan}'
```

`run-all-traders`는 과도한 provider 호출을 막기 위해 backend에서 기본 mock provider를 강제합니다.

`locale`은 `ko` 또는 `en`을 보낼 수 있습니다. UI에서 언어를 전환한 뒤 실행하는 run-cycle/review-demo는 해당 언어를 backend에 전달하며, Gemini와 mock provider는 AI 근거 문장(`approvalReason`, `counterThesis`, `userSummary`, `adjustments`)을 해당 언어로 생성하도록 요청받습니다.

차트 확인:

- `/traders` 상단 공통 차트에서 BTCUSDT/ETHUSDT 선택 심볼의 1분봉을 확인합니다.
- `/traders` 상단 공통 차트에서 BTCUSDT/ETHUSDT 선택 심볼의 캔들을 확인합니다. 기본은 `1h`입니다.
- 차트 렌더링은 TradingView Lightweight Charts를 사용합니다. TradingView iframe 위젯이 아니므로 우리 AI run-cycle 결과의 진입/손절/익절 price line을 직접 붙일 수 있습니다.
- 차트는 초기 최근 캔들을 REST public API로 채운 뒤, Binance Futures WebSocket으로 최신 캔들을 갱신합니다. WebSocket 메시지가 지연되는 환경에서도 차트가 비지 않도록 REST 보조 갱신을 둡니다.
- 차트는 휠 확대/축소, 드래그 좌우 이동, 버튼 기반 이전/최신 이동, 확대/축소, 리셋을 지원합니다.
- run-cycle 결과가 `PAPER_TRADING_PENDING`이면 진입, 손절, 익절 라인이 차트에 표시됩니다.
- 진입/손절/익절 라인은 차트 y축 스케일을 강제로 벌리지 않습니다. 보이는 캔들 범위 밖의 plan 가격은 가장자리 라벨로 표시되어 캔들이 압축되지 않습니다.
- candidate가 없거나 AI review가 승인되지 않으면 차트에는 plan marker가 표시되지 않습니다.

저장된 Step 2 결과 확인:

```bash
curl -s http://localhost:8000/api/db/status | jq
curl -s http://localhost:8000/api/runs | jq
curl -s http://localhost:8000/api/runs/1 | jq
curl -s http://localhost:8000/api/market-snapshots | jq
curl -s http://localhost:8000/api/candidate-trades | jq
curl -s http://localhost:8000/api/ai/reviews | jq
curl -s http://localhost:8000/api/trade-plans | jq
curl -s http://localhost:8000/api/provider-calls | jq
curl -s http://localhost:8000/api/paper/trader-states | jq
curl -s http://localhost:8000/api/paper/orders | jq
curl -s http://localhost:8000/api/paper/positions | jq
curl -s http://localhost:8000/api/paper/events | jq
curl -s http://localhost:8000/api/paper/management-reviews | jq
curl -s http://localhost:8000/api/paper/agent-states | jq
curl -s http://localhost:8000/api/paper/equity-snapshots | jq
```

필요하면 FastAPI docs에서 request/response schema를 함께 확인합니다.

```text
http://localhost:8000/docs
```

## 테스트

Backend:

```bash
cd apps/api
source .venv/bin/activate
pytest
```

Frontend typecheck:

```bash
cd apps/web
npm run typecheck
```

Frontend build:

```bash
cd apps/web
npm run build
```

## AI Provider 변경

`apps/api/.env`에서 변경합니다.

```dotenv
AI_PROVIDER=mock
AI_MISSING_KEY_FALLBACK_TO_MOCK=true
```

Gemini를 기본 provider로 사용하려면 `AI_PROVIDER`를 `gemini`로 바꾸고 Gemini API key를 설정합니다. 실제 key는 아래처럼 빈 placeholder 자리에만 넣고 README, 코드, 커밋에는 노출하지 않습니다.

```dotenv
AI_PROVIDER=gemini
AI_MISSING_KEY_FALLBACK_TO_MOCK=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
```

Provider 상태 확인:

```bash
curl -s http://localhost:8000/api/ai/providers | jq
```

mock으로 되돌리려면 다시 다음처럼 설정합니다.

```dotenv
AI_PROVIDER=mock
AI_MISSING_KEY_FALLBACK_TO_MOCK=true
GEMINI_API_KEY=
```

기본 provider를 mock으로 둔 상태에서도 아래 endpoint는 명시적으로 Gemini를 테스트합니다.

```bash
POST /api/ai/review-demo?provider=gemini
POST /api/traders/channel-rider/run-cycle?provider=gemini
```

페이지 로드만으로 Gemini가 자동 호출되지는 않습니다. `/tests` 화면의 “실제 Gemini AI 호출” 버튼을 누를 때만 Gemini 호출을 시도합니다.

Position Management AI는 별도 provider를 지정할 수 있습니다. 비워 두면 수동 run-cycle 또는 자동 스캐너가 넘긴 provider를 따르고, 명시하면 해당 provider를 우선 사용합니다.

```dotenv
ENABLE_POSITION_MANAGEMENT_AI=true
POSITION_MANAGEMENT_PROVIDER=mock
POSITION_MANAGEMENT_COOLDOWN_SECONDS=300
POSITION_MANAGEMENT_MAX_REVIEWS_PER_CYCLE=2
POSITION_MANAGEMENT_PENDING_HEARTBEAT_SECONDS=300
POSITION_MANAGEMENT_OPEN_HEARTBEAT_SECONDS=300
POSITION_MANAGEMENT_URGENT_COOLDOWN_SECONDS=60
```

`POSITION_MANAGEMENT_PROVIDER=gemini`로 바꾸면 활성 paper 주문/포지션 관리 이벤트 또는 heartbeat 리뷰가 발생할 때 Gemini를 호출할 수 있습니다. 이 호출도 실제 AI 호출이므로 장시간 자동 스캐너에서는 비용/쿼터를 확인한 뒤 사용하세요.

OpenAI 예시:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRADE_REVIEW_MODEL=gpt-5.4-mini
OPENAI_POSITION_MANAGEMENT_MODEL=gpt-5.4-nano
OPENAI_LEAGUE_SENTIMENT_MODEL=gpt-5.4-nano
```

`OPENAI_MODEL`은 기본 fallback 모델입니다. 2차 진입 리뷰, 포지션 중간 리뷰, Aigentra 종합 의견을 분리하려면 위 세 모델 변수를 각각 지정합니다.

다른 provider:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-latest

AI_PROVIDER=grok
GROK_API_KEY=
GROK_MODEL=grok-2-latest
```

모델명은 provider별 최신 정책에 따라 바뀔 수 있으므로 `.env`에서 교체합니다.

Gemini 사용 시 주의사항:

- Gemini API 호출은 Google AI Studio 또는 Google Cloud 계정의 과금/무료 쿼터 정책을 따릅니다.
- `provider=gemini`가 붙은 run-cycle 또는 review-demo는 AI review가 필요한 후보가 생성될 때 provider API를 호출할 수 있습니다.
- `run-all-traders`는 backend에서 mock provider를 강제하므로 Gemini를 자동 반복 호출하지 않습니다.
- provider 실패 시 최대 1회만 재시도하고, 설정에 따라 mock으로 fallback합니다.
- `provider_call_logs`에는 API key나 prompt 전문을 저장하지 않고 provider, model, success, latency, decision, error 정도만 저장합니다.
- 쿼터 초과, 결제 미설정, 잘못된 key, 지원되지 않는 모델명은 provider 오류로 이어질 수 있습니다.
- 비용 통제가 필요하면 `AI_PROVIDER=mock`으로 두고 개발 검증을 먼저 진행합니다.

## Paper Trading 엔진 기준

- 트레이더별 시작 equity 기본값은 `$10,000`입니다.
- 기본 maker fee는 `0.0002`, taker fee는 `0.0005`로 둡니다. 실제 Binance Futures 수수료는 계정 등급, 프로모션, 시장 정책에 따라 바뀔 수 있으므로 운영 전에는 최신 fee schedule에 맞춰 `.env` 값을 조정해야 합니다.
- 후보마다 1차 전략이 `riskPercent`, `leveragePlan`, `orderIntent`, `earlyExitRules`를 생성합니다.
- 2차 AI review는 승인/수정승인 시 leverage/risk/early exit 보정값을 줄 수 있습니다.
- paper order 수량은 `equity * riskPercent / stopDistance` 기반으로 산정하고, leverage 기반 최대 notional cap을 다시 적용합니다.
- `paper engine run-once`는 1분봉 OHLC로 limit/market fill, TP/SL, maker/taker fee, realized/unrealized PnL을 갱신합니다.
- 열린 paper position은 1R 이상 유리하게 움직이면 stop을 본절로 이동합니다.
- TP의 80% 근처까지 갔다가 강하게 되돌리면 조기익절(`early_profit_protect`)을 수행할 수 있습니다.
- 손절가에 닿기 전이라도 현재 캔들 종가가 thesis failure 기준을 넘으면 조기종료(`early_thesis_failure`)를 수행할 수 있습니다.
- Position Management AI는 hard risk engine 이후에 호출됩니다. stop을 무제한으로 넓히거나 설정된 최대 레버리지를 넘기는 액션은 허용하지 않지만, 트레이더 컨셉과 리스크 한도 안에서는 남은 주문 취소, 손절 조정, 부분익절, 조기종료, 제한적 물타기/불타기 주문을 제안할 수 있습니다.
- 관리 AI 액션은 `position_management_reviews`에 저장되고, 적용된 paper 이벤트는 `trade_events`에 남습니다.
- agent의 현재 상태와 다음 리뷰 예정시각은 `trader_agent_states`에 저장됩니다.
- 대기 주문과 오픈 포지션은 기본 300초마다 heartbeat AI 리뷰를 수행합니다. HIGH severity 이벤트는 기본 60초 cooldown으로 더 빠르게 재검토할 수 있습니다.
- 같은 trader+symbol에 open paper order 또는 open paper position이 있으면 새 run-cycle은 후보를 만들지 않고 `ACTIVE_PAPER_EXPOSURE` 관리 상태를 반환합니다.

## 트레이더별 Position Management 이벤트

각 트레이더는 같은 관리 AI를 쓰더라도 이벤트 조건과 허용 액션을 다르게 둡니다.

| Trader | 대기 주문 관리 | 오픈 포지션 관리 |
| --- | --- | --- |
| Channel Rider | 채널 이탈 또는 채널 중앙선까지 이동해 edge 진입 의미가 사라지면 pending order 취소 | 채널 thesis 실패 시 조기종료, 채널 중앙선 또는 1R 도달 시 본절/보호 stop 검토 |
| Volume Breaker | 리테스트 레벨이 실패하거나 돌파 거래량이 식으면 pending order 취소 | 돌파 레벨이 다시 깨지면 조기종료, 거래량 모멘텀 약화 시 위험 축소 |
| Pullback Architect | EMA50 밴드가 깨지거나 funding 과열 시 남은 분할 주문 취소 | EMA50 thesis 실패 시 조기종료, funding 과열 또는 목표 접근 시 남은 주문/위험 축소 |
| Leverage Hunter | 구조 trigger가 회수되거나 crowding/funding 신호가 뒤집히면 pending order 취소 | squeeze/crowding thesis가 반대로 움직이면 조기종료 또는 부분 축소 |
| Liquidity Reaper | sweep wick 영역 너머로 가격이 안착하거나 반대 거래량이 강하면 pending order 취소 | sweep 실패 또는 wick 방어 실패 시 조기종료/위험 축소 |

공통 fallback 이벤트도 있습니다. 첫 목표의 80% 근처까지 간 포지션은 부분익절을 검토하고, hard stop까지 0.3R 이하로 가까워지면 손절 도달 전 위험 축소를 검토합니다.

v2 heartbeat는 이벤트가 없는 평상시에도 AI가 다음을 능동적으로 판단하게 합니다.

- pending order: 계속 기다릴지, 진입가를 조정할지, 주문을 취소할지 판단
- open position: 계속 보유할지, 본절/트레일링 stop으로 바꿀지, 부분익절할지, 조기종료할지 판단
- agent state: `WATCHING`, `MONITORING`, `ACTIVE_REVIEW`, `RISK_MANAGEMENT`, `PROFIT_MANAGEMENT`, `DEFENSIVE` 모드로 현재 상태를 표시

## 자동 스캐너 운영 방향

`ENABLE_AUTO_SCANNER=false`가 기본값입니다. 로컬에서 밤새 BTC만 관찰하려면 아래처럼 켭니다.

```dotenv
ENABLE_AUTO_SCANNER=true
AUTO_SCANNER_SYMBOLS=BTCUSDT
AUTO_SCANNER_INTERVAL_SECONDS=60
AUTO_SCANNER_PROVIDER=mock
AUTO_SCANNER_LOCALE=ko
AUTO_SCANNER_SNAPSHOT_CONCURRENCY=3
AUTO_SCANNER_AI_CONCURRENCY=2
AI_REJECTION_COOLDOWN_SECONDS=300
ENABLE_POSITION_MANAGEMENT_AI=true
POSITION_MANAGEMENT_PROVIDER=mock
POSITION_MANAGEMENT_COOLDOWN_SECONDS=300
POSITION_MANAGEMENT_PENDING_HEARTBEAT_SECONDS=300
POSITION_MANAGEMENT_OPEN_HEARTBEAT_SECONDS=300
```

자동 스캐너는 paper only이며 Binance private API나 실제 주문 API를 호출하지 않습니다. 기본값은 `mock` provider라서 매분 AI 유료 호출이 발생하지 않습니다. Gemini를 쓰려면 `AUTO_SCANNER_PROVIDER=gemini` 또는 `POSITION_MANAGEMENT_PROVIDER=gemini`로 명시해야 하지만, 후보나 관리 이벤트가 자주 생기는 장에서는 비용/쿼터가 발생할 수 있으므로 로컬 장시간 테스트는 `mock`을 권장합니다.

신규 진입 스캐너는 심볼별 market snapshot을 제한 병렬로 수집하고, 1차 통과 후보만 2차 AI/run-cycle로 넘깁니다. `AUTO_SCANNER_SNAPSHOT_CONCURRENCY`는 BTC/ETH 같은 심볼 snapshot 동시 처리 수, `AUTO_SCANNER_AI_CONCURRENCY`는 후보 발생 시 AI 검증 동시 호출 수입니다. Gemini 사용 시 과금/쿼터를 피하려면 `AUTO_SCANNER_AI_CONCURRENCY=1~2`를 유지하세요.

2차 AI가 `REJECT`, `DEFER`, `NEEDS_MORE_DATA`를 반환하면 같은 trader+symbol은 `AI_REJECTION_COOLDOWN_SECONDS` 동안 신규 1차 검증을 건너뜁니다. 기본값은 300초, 즉 5분입니다. 이 cooldown은 신규 후보 생성을 막는 용도이며 이미 열린 paper 주문/포지션 평가는 계속 진행됩니다.

Position Management AI도 같은 이벤트를 반복 호출하지 않도록 `POSITION_MANAGEMENT_COOLDOWN_SECONDS` 동안 trader+symbol+exposure+event 단위로 재호출을 막습니다. 기본값은 300초입니다. heartbeat 리뷰는 agent state의 `nextReviewAt`이 지나면 다시 실행됩니다.

수동으로 BTC 스캔 1회를 실행할 수도 있습니다.

```bash
curl -X POST http://localhost:8000/api/scanner/run-once \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","provider":"mock","locale":"ko"}'
```

배포 단계에서는 별도 worker 또는 scheduler에서 아래 순서로 관리하는 구조가 적합합니다.

```text
1. BTCUSDT/ETHUSDT public market data 갱신
2. paper engine으로 기존 주문/포지션 mark-to-market 및 TP/SL/조기 종료 판단
3. 남은 대기 주문/오픈 포지션에 관리 이벤트가 있거나 heartbeat 시간이 됐으면 Position Management AI 호출
4. trader별 활성 exposure가 없을 때만 1차 전략 검사
5. candidate 생성 시에만 2차 AI review 호출
6. 승인/수정승인 시 paper order 생성
7. 모든 상태를 DB에 저장하고 UI는 DB 조회 + websocket chart를 표시
```

Gemini나 고급 LLM은 candidate가 실제로 생성된 경우에만 호출해야 하며, run-all-traders는 계속 mock 기본값을 유지합니다.

## 안전 원칙

- Binance public market data만 사용합니다.
- Binance 계좌 API key를 받지 않습니다.
- 실제 주문 endpoint를 만들지 않았습니다.
- 실제 거래소 포지션, 실제 레버리지 변경, 출금, 입금 기능이 없습니다.
- 내부 `paper_orders`/`paper_positions`는 시뮬레이션 전용입니다.
- 모든 trader 결과는 paper trading plan, paper order, paper position 또는 candidate trade입니다.
- UI와 API의 성과 수치는 데모용 mock performance입니다.
