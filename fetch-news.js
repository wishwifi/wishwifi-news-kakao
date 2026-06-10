// fetch-news.js
// GitHub Actions에서 실행되는 RSS 수집 스크립트
// 서버 비용 0원 - GitHub Actions 무료 플랜으로 월 2,000분 제공

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; WishWifiFeed/1.0)'
  }
});

// RSS 피드 목록 (완전 무료, API 키 불필요)
const FEEDS = [
  // 한국 경제/증시
  { source: '한국경제', url: 'https://www.hankyung.com/feed/finance', lang: 'ko', emoji: '📈' },
  { source: '연합뉴스', url: 'https://www.yna.co.kr/RSS/economy.xml', lang: 'ko', emoji: '📰' },
  { source: '매일경제', url: 'https://www.mk.co.kr/rss/40300001/', lang: 'ko', emoji: '💹' },
  { source: '이데일리', url: 'https://www.edaily.co.kr/rss/edaily_stock.xml', lang: 'ko', emoji: '🏦' },
  // 글로벌 (영어)
  { source: 'Reuters', url: 'https://feeds.reuters.com/reuters/businessNews', lang: 'en', emoji: '🌐' },
  { source: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories', lang: 'en', emoji: '📊' },
  { source: 'Investing.com', url: 'https://www.investing.com/rss/news_25.rss', lang: 'en', emoji: '💰' },
];

// 증시 관련 키워드 필터 (관련성 높은 뉴스 우선)
const MARKET_KEYWORDS_KO = ['주식', '증시', '코스피', '나스닥', 'S&P', '금리', '달러', '환율', '실적', '투자', '펀드', '채권', '인플레', '연준', 'Fed', '관세', '트럼프'];
const MARKET_KEYWORDS_EN = ['stock', 'market', 'nasdaq', 'S&P', 'fed', 'rate', 'inflation', 'earnings', 'trade', 'tariff', 'trump', 'economy', 'gdp', 'rally', 'selloff'];

function isMarketRelevant(title, lang) {
  const keywords = lang === 'ko' ? MARKET_KEYWORDS_KO : MARKET_KEYWORDS_EN;
  const lowerTitle = title.toLowerCase();
  return keywords.some(k => lowerTitle.includes(k.toLowerCase()));
}

function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')           // HTML 태그 제거
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);                     // 150자 이하로 요약
}

async function fetchFeed(feedInfo) {
  try {
    console.log(`  📡 수집 중: ${feedInfo.source}`);
    const feed = await parser.parseURL(feedInfo.url);
    
    const items = feed.items
      .slice(0, 15)  // 최신 15개만
      .filter(item => item.title)
      .map(item => ({
        title: cleanText(item.title),
        summary: cleanText(item.contentSnippet || item.summary || ''),
        link: item.link || '',
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        source: feedInfo.source,
        lang: feedInfo.lang,
        emoji: feedInfo.emoji,
        isMarketRelated: isMarketRelevant(item.title, feedInfo.lang),
      }))
      .filter(item => item.title.length > 5);
    
    console.log(`    ✅ ${items.length}개 수집`);
    return items;
  } catch (err) {
    console.log(`    ❌ 실패: ${feedInfo.source} - ${err.message}`);
    return [];
  }
}

function generateKakaoTemplate(newsItems) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kstNow.toISOString().slice(0, 10);
  const hour = kstNow.getUTCHours();
  
  let timeLabel = '아침';
  if (hour >= 12 && hour < 18) timeLabel = '점심';
  else if (hour >= 18) timeLabel = '저녁';

  // 시장 관련 TOP 5 한국어 뉴스
  const koNews = newsItems.filter(n => n.lang === 'ko' && n.isMarketRelated).slice(0, 5);
  // 글로벌 TOP 3
  const enNews = newsItems.filter(n => n.lang === 'en' && n.isMarketRelated).slice(0, 3);

  let msg = `📊 마켓피드 ${timeLabel} 브리핑\n${dateStr}\n\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🇰🇷 국내 주요 뉴스\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;

  koNews.forEach((n, i) => {
    msg += `${i + 1}. ${n.emoji} ${n.title}\n`;
    if (n.summary) msg += `   └ ${n.summary.slice(0, 60)}...\n`;
    msg += `   🔗 ${n.link}\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🌐 글로벌 뉴스\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;

  enNews.forEach((n, i) => {
    msg += `${i + 1}. ${n.emoji} ${n.title}\n`;
    msg += `   🔗 ${n.link}\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `📈 전체 보기\n`;
  msg += `https://news.wishwifi.com\n\n`;
  msg += `💡 투자는 본인 책임 하에\n`;
  msg += `마켓피드 · news.wishwifi.com`;

  return msg;
}

async function main() {
  console.log('🚀 WishWifi 뉴스 수집 시작...\n');

  // data 폴더 생성
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 병렬로 모든 RSS 수집
  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  
  const allItems = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)); // 최신순 정렬

  console.log(`\n📊 총 ${allItems.length}개 뉴스 수집`);

  // news.json 저장
  const output = {
    updatedAt: new Date().toISOString(),
    updatedAtKST: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' KST',
    totalCount: allItems.length,
    marketRelatedCount: allItems.filter(n => n.isMarketRelated).length,
    items: allItems,
  };

  fs.writeFileSync(
    path.join(dataDir, 'news.json'),
    JSON.stringify(output, null, 2),
    'utf-8'
  );

  // 카카오톡 템플릿 생성
  const kakaoMsg = generateKakaoTemplate(allItems);
  fs.writeFileSync(
    path.join(dataDir, 'kakao-template.txt'),
    kakaoMsg,
    'utf-8'
  );

  console.log('✅ data/news.json 저장 완료');
  console.log('✅ data/kakao-template.txt 저장 완료');
  console.log('\n카카오 메시지 미리보기:');
  console.log('─'.repeat(50));
  console.log(kakaoMsg.slice(0, 500));
}

main().catch(console.error);
