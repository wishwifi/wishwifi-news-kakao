// netlify/edge-functions/meta-inject.js
// 카카오 크롤러 → news.json에서 오늘 뉴스 기반 메타태그 동적 주입

const NEWS_URL = 'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/data/news.json';
const SUMMARY_URL = 'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/data/summary.json';
const SITE_NAME = '마켓피드';
const FALLBACK_IMG = 'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/assets/og-1.svg';

// ?v= 파라미터로 슬롯 판단 (예: 20260613_18 → 18시 슬롯)
function getSlotHour(vParam) {
  if (!vParam) return null;
  const parts = vParam.split('_');
  return parts[1] ? parseInt(parts[1]) : null;
}

// 슬롯 시간에 해당하는 뉴스 필터 (해당 시간대 수집 뉴스)
function getSlotNews(items, slotHour) {
  if (slotHour === null) return items.filter(n => n.isMarketRelated && n.lang === 'ko');
  
  // 슬롯별 수집 시간 범위
  const ranges = {
    6:  [0, 6],   // 자정~06시 수집
    12: [6, 12],  // 06~12시 수집
    18: [12, 18], // 12~18시 수집
    0:  [18, 24], // 18~24시 수집
  };
  const range = ranges[slotHour] || [0, 24];

  return items.filter(n => {
    if (!n.isMarketRelated || n.lang !== 'ko') return false;
    if (!n.pubDate) return true;
    const h = new Date(new Date(n.pubDate).getTime() + 9*60*60*1000).getUTCHours();
    return h >= range[0] && h < range[1];
  });
}

export default async (request, context) => {
  const ua = request.headers.get('user-agent') || '';
  const isCrawler = /kakaotalk|facebookexternalhit|twitterbot|googlebot|bingbot|naverbot|yeti|daumoa|applebot|linkedinbot/i.test(ua);
  if (!isCrawler) return context.next();

  const url = new URL(request.url);
  const vParam = url.searchParams.get('v');
  const slotHour = getSlotHour(vParam);

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateStr = `${kst.getMonth() + 1}월 ${kst.getDate()}일`;
  const slotLabel = slotHour === 6 ? '아침' : slotHour === 12 ? '점심' : slotHour === 18 ? '저녁' : slotHour === 0 ? '자정' : '오늘';

  let title = `${SITE_NAME} · ${dateStr} ${slotLabel} 증시 뉴스`;
  let description = '미국 S&P500·나스닥·다우, 한국 코스피 실시간 시장 동향. 트럼프 발언·금리·환율·실적까지 한눈에.';
  let ogImage = FALLBACK_IMG;

  try {
    // news.json + summary.json 병렬 fetch
    const [newsRes, summaryRes] = await Promise.all([
      fetch(NEWS_URL, { signal: AbortSignal.timeout(5000) }),
      fetch(SUMMARY_URL, { signal: AbortSignal.timeout(5000) }),
    ]);

    const [newsData, summaryData] = await Promise.all([
      newsRes.ok ? newsRes.json() : null,
      summaryRes.ok ? summaryRes.json() : null,
    ]);

    // 이미지: summary.json의 Unsplash 이미지 우선
    if (summaryData?.ogImage) ogImage = summaryData.ogImage;

    // 슬롯에 맞는 뉴스 추출
    const items = newsData?.items || [];
    const slotNews = getSlotNews(items, slotHour);
    const topNews = slotNews.length > 0 ? slotNews : items.filter(n => n.isMarketRelated && n.lang === 'ko');

    if (topNews.length > 0) {
      // 제목: 가장 최신 뉴스 헤드라인
      const headline = topNews[0].title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
      title = `${headline.slice(0, 33)}... | ${SITE_NAME} ${dateStr} ${slotLabel}`;

      // 설명: TOP 3 뉴스 제목 조합
      const pts = topNews.slice(0, 3).map(n =>
        n.title.replace(/\[.*?\]/g, '').trim().slice(0, 25)
      );
      description = `${pts.join(' · ')} | ${dateStr} ${slotLabel} 증시 뉴스`;
    }
  } catch (e) {}

  // 원본 HTML 가져와서 메타태그 교체
  const response = await context.next();
  const html = await response.text();

  const injected = html
    .replace(/<title[^>]*>.*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/(<meta\s+name="description"[^>]*content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+property="og:title"[^>]*content=")[^"]*(")/i, `$1${esc(title)}$2`)
    .replace(/(<meta\s+property="og:description"[^>]*content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+property="og:image"[^>]*content=")[^"]*(")/i, `$1${esc(ogImage)}$2`)
    .replace(/(<meta\s+name="twitter:title"[^>]*content=")[^"]*(")/i, `$1${esc(title)}$2`)
    .replace(/(<meta\s+name="twitter:description"[^>]*content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+name="twitter:image"[^>]*content=")[^"]*(")/i, `$1${esc(ogImage)}$2`);

  return new Response(injected, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store', // 캐시 없음 - 항상 최신
    },
  });
};

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export const config = { path: '/*' };
