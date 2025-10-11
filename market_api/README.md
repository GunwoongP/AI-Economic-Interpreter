### Market API (FastAPI + yfinance)

로컬에서 3개월 지수 시세를 제공하는 간단한 서비스입니다.

#### 설치

```bash
python -m venv .venv
.venv/Scripts/activate  # Windows PowerShell, macOS/Linux는 source .venv/bin/activate
pip install -r market_api/requirements.txt
```

#### 실행

```bash
uvicorn market_api.app:app --host 127.0.0.1 --port 8000 --reload
```

#### 엔드포인트

| 경로 | 설명 |
| ---- | ---- |
| `GET /series/KOSPI` | KOSPI 3개월 시세 (UTC 기준 일봉, 10분 캐싱) |
| `GET /series/IXIC`  | NASDAQ 종합 지수 3개월 시세 |
| `GET /health`       | 헬스 체크 |

FastAPI 서버가 켜진 상태에서 `npm run dev`를 실행하면 Next.js 라우트(`/api/timeseries`)가 자동으로 이 서비스로 프록시합니다.
