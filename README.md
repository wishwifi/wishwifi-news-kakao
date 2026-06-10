# 📊 마켓피드 카카오 뉴스레터 시스템

**서버 비용 $0** · GitHub Actions + 카카오 공유하기 기반 자동화

---

## 📁 파일 구조

```
your-repo/
├── .github/
│   └── workflows/
│       └── fetch-news.yml    # 6시간마다 자동 실행
├── data/
│   ├── news.json             # ← Actions가 자동 생성 (커밋 불필요)
│   └── kakao-template.txt   # ← 카카오 메시지 원문 텍스트
├── fetch-news.js             # RSS 수집 스크립트
├── package.json
└── kakao-admin.html          # 관리자 UI (wishwifi.com 아무 곳에나 올려도 됨)
```

---

## 🚀 설치 순서

### 1단계 · GitHub 저장소 설정

1. GitHub에서 새 저장소 생성 (예: `wishwifi-news`)
2. 이 폴더의 모든 파일 업로드
3. **Settings → Pages → Branch: main, folder: / (root)** 활성화
4. 완료! Actions가 자동으로 `data/news.json`을 6시간마다 업데이트

→ `news.json` URL 예: `https://YOUR_USERNAME.github.io/wishwifi-news/data/news.json`

### 2단계 · 관리자 페이지 설정

1. `kakao-admin.html`을 wishwifi.com에 업로드 (예: news.wishwifi.com/admin.html)
2. 페이지 열기 → **가이드 탭** → news.json URL 입력 후 저장
3. 뉴스 로드 완료!

### 3단계 · 카카오 발송

**방법 A (즉시 사용 가능) — 복사 붙여넣기:**
1. 관리자 페이지에서 뉴스 선택
2. "메시지 복사" 버튼 클릭
3. 카카오 채널 관리자 → 메시지 → 붙여넣기 발송

**방법 B (카카오 SDK 연동):**
1. [developers.kakao.com](https://developers.kakao.com) 앱 생성
2. JavaScript 앱키 복사
3. `kakao-admin.html`에서 `YOUR_KAKAO_APP_KEY` 교체
4. "카카오톡으로 공유하기" 버튼으로 즉시 발송

---

## ⏰ GitHub Actions 일정

| 실행 시간 (KST) | 용도 |
|---|---|
| 06:00 | 아침 장 개장 전 브리핑 |
| 12:00 | 점심 중간 점검 |
| 18:00 | 장 마감 후 정리 |
| 00:00 | 미국 장 야간 업데이트 |

---

## 📡 RSS 피드 목록 (모두 무료)

| 소스 | URL |
|---|---|
| 한국경제 | https://www.hankyung.com/feed/finance |
| 연합뉴스 | https://www.yna.co.kr/RSS/economy.xml |
| 매일경제 | https://www.mk.co.kr/rss/40300001/ |
| 이데일리 | https://www.edaily.co.kr/rss/edaily_stock.xml |
| Reuters | https://feeds.reuters.com/reuters/businessNews |
| MarketWatch | https://feeds.marketwatch.com/marketwatch/topstories |

---

## 💰 비용 분석

| 항목 | 비용 |
|---|---|
| GitHub Actions | **$0** (무료 2,000분/월) |
| GitHub Pages | **$0** |
| RSS 피드 | **$0** |
| 카카오 공유하기 SDK | **$0** |
| 카카오 채널 메시지 (월 1회) | **$0** |
| **합계** | **$0** |

> 구독자 수 많아질 경우: 카카오 알림톡 전환 (건당 약 9원)
