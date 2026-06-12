// netlify/edge-functions/meta-inject.js
// 카카오·구글 크롤러 접근 시 summary.json + 기사 OG이미지 동적 주입

const SUMMARY_URL = 'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/data/summary.json';
const SITE_NAME = '마켓피드';

// GitHub 호스팅 fallback 이미지 (Unsplash 없을 때)
const FALLBACK_IMAGES = [
  'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/assets/og-1.svg',
  'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/assets/og-2.svg',
];

// 기사 URL에서 og:image 추출
async function fetchArticleImage(articleUrl) {
  if (!articleUrl || articleUrl === '#') return null;
  try {
    const res = await fetch(articleUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MetaBot/1.0)' }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // og:image 추출
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (match && match[1] && match[1].startsWith('http')) {
      return match[1];
    }
    return null;
  } catch (e) {
    return null;
  }
}

export default async (request, context) => {
  // 크롤러 여부 확인
  const ua = request.headers.get('user-agent') || '';
  const isCrawler = /kakaotalk|facebookexternalhit|twitterbot|googlebot|bingbot|naverbot|yeti|daumoa|applebot|linkedinbot/i.test(ua);

  if (!isCrawler) return context.next();

  // KST 날짜
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateStr = `${kst.getMonth() + 1}월 ${kst.getDate()}일`;

  let title = `${SITE_NAME} · 미국 증시·글로벌 시장 뉴스`;
  let description = '미국 S&P500·나스닥·다우, 한국 코스피 실시간 시장 동향. 트럼프 발언·금리·환율·실적까지 한눈에.';
  let ogImage = FALLBACK_IMAGES[kst.getDate() % FALLBACK_IMAGES.length];

  try {
    const res = await fetch(SUMMARY_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const summary = await res.json();

      // summary.json에 저장된 Unsplash 이미지 URL 사용
      if (summary.ogImage) ogImage = summary.ogImage;

      const kst2 = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const dateStr = `${kst2.getMonth() + 1}월 ${kst2.getDate()}일`;

      if (summary.headline) {
        title = `${summary.headline.slice(0, 35).replace(/\[.*?\]/g, '').trim()}... | ${SITE_NAME} ${dateStr}`;
      }

      if (summary.points && summary.points.length >= 2) {
        const pts = summary.points.slice(0, 3).map(p =>
          p.title.replace(/\[.*?\]/g, '').trim()
        );
        description = `${pts.join(' · ')} | ${dateStr} 증시 뉴스`;
      }
    }
  } catch (e) {
    // 기본값 사용
  }

  // 원본 HTML 가져와서 메타태그 교체
  const response = await context.next();
  const html = await response.text();

  const injected = html
    .replace(/<title[^>]*>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/(<meta\s+name="description"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta\s+property="og:title"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta\s+property="og:description"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta\s+property="og:image"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(ogImage)}$2`)
    .replace(/(<meta\s+name="twitter:title"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(title)}$2`)
    .replace(/(<meta\s+name="twitter:description"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(description)}$2`)
    .replace(/(<meta\s+name="twitter:image"[^>]*content=")[^"]*(")/i, `$1${escapeHtml(ogImage)}$2`);

  return new Response(injected, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=21600',
    },
  });
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const config = { path: '/' };

const SUMMARY_URL = 'https://raw.githubusercontent.com/wishwifi/wishwifi-news-kakao/main/data/summary.json';
const SITE_URL = 'https://news.wishwifi.com';
const SITE_NAME = '마켓피드';

// Unsplash 금융 사진 (날짜별 자동 교체)
const IMAGES = [
  'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=630&fit=crop&q=80',
  'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&h=630&fit=crop&q=80',
  'https://images.unsplash.com/photo-1642790551116-18e4f1c70d30?w=1200&h=630&fit=crop&q=80',
  'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=1200&h=630&fit=crop&q=80',
  'https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=1200&h=630&fit=crop&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=630&fit=crop&q=80',
  'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=1200&h=630&fit=crop&q=80',
];

export default async (request, context) => {
  const url = new URL(request.url);

  // 크롤러 여부 확인 (카카오·구글·페이스북·네이버 등)
  const ua = request.headers.get('user-agent') || '';
  const isCrawler = /kakaotalk|facebookexternalhit|twitterbot|googlebot|bingbot|naverbot|yeti|daumoa|applebot|linkedinbot/i.test(ua);

  // 크롤러가 아니면 그냥 원본 페이지 반환 (일반 사용자)
  if (!isCrawler) {
    return context.next();
  }

  // ── 크롤러일 때만 summary.json 읽어서 메타태그 생성 ──
  let title = `${SITE_NAME} · 미국 증시·글로벌 시장 뉴스`;
  let description = '미국 S&P500·나스닥·다우, 한국 코스피 실시간 시장 동향. 트럼프 발언·금리·환율·실적까지 한눈에.';

  try {
    const res = await fetch(SUMMARY_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const summary = await res.json();

      // 오늘 날짜 (KST)
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const dateStr = `${kst.getMonth() + 1}월 ${kst.getDate()}일`;

      // 헤드라인에서 제목 생성
      if (summary.headline) {
        title = `${summary.headline.slice(0, 35).replace(/\[.*?\]/g, '').trim()}... | ${SITE_NAME} ${dateStr}`;
      }

      // 핵심 포인트에서 description 생성
      if (summary.points && summary.points.length >= 2) {
        const pts = summary.points.slice(0, 3).map(p =>
          p.title.replace(/\[.*?\]/g, '').trim()
        );
        description = `${pts.join(' · ')} | ${dateStr} 증시 뉴스`;
      }
    }
  } catch (e) {
    // fetch 실패 시 기본값 사용
  }

  // 오늘 이미지 (날짜 기반 순환)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const ogImage = IMAGES[dayOfYear % IMAGES.length];

  // 원본 HTML 가져오기
  const response = await context.next();
  const html = await response.text();

  // 메타태그 교체 (정규식으로 <head> 안의 og/twitter/title/description 태그 치환)
  const injected = html
    .replace(
      /<title[^>]*>.*?<\/title>/i,
      `<title>${escapeHtml(title)}</title>`
    )
    .replace(
      /(<meta\s+name="description"[^>]*content=")[^"]*(")/i,
      `$1${escapeHtml(description)}$2`
    )
    .replace(
      /(<meta\s+property="og:title"[^>]*content=")[^"]*(")/i,
      `$1${escapeHtml(title)}$2`
    )
    .replace(
      /(<meta\s+property="og:description"[^>]*content=")[^"]*(")/i,
      `$1${escapeHtml(description)}$2`
    )
    .replace(
      /(<meta\s+property="og:image"[^>]*content=")[^"]*(")/i,
      `$1${ogImage}$2`
    )
    .replace(
      /(<meta\s+name="twitter:title"[^>]*content=")[^"]*(")/i,
      `$1${escapeHtml(title)}$2`
    )
    .replace(
      /(<meta\s+name="twitter:description"[^>]*content=")[^"]*(")/i,
      `$1${escapeHtml(description)}$2`
    )
    .replace(
      /(<meta\s+name="twitter:image"[^>]*content=")[^"]*(")/i,
      `$1${ogImage}$2`
    );

  return new Response(injected, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=21600', // 6시간 캐시 (뉴스 업데이트 주기와 동일)
    },
  });
};

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const config = {
  path: '/',
};
