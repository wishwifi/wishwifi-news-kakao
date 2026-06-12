// fetch-news.js — WishWifi 마켓피드 자동 수집기
// GitHub Actions에서 6시간마다 실행 (비용 $0)
// 생성 파일: data/news.json, data/summary.json, data/kakao-template.txt

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WishWifiFeed/1.0)' }
});

// ── RSS 피드 목록 ──
const FEEDS = [
  { source: '한국경제', url: 'https://www.hankyung.com/feed/finance',         lang: 'ko', emoji: '📈' },
  { source: '한국경제', url: 'https://www.hankyung.com/feed/international',   lang: 'ko', emoji: '📈' },
  { source: '연합뉴스', url: 'https://www.yna.co.kr/RSS/economy.xml',         lang: 'ko', emoji: '📰' },
  { source: '연합뉴스', url: 'https://www.yna.co.kr/rss/stock.xml',           lang: 'ko', emoji: '📰' },
  { source: '매일경제', url: 'https://www.mk.co.kr/rss/40300001/',            lang: 'ko', emoji: '💹' },
  { source: '서울경제', url: 'https://www.sedaily.com/RSS',                   lang: 'ko', emoji: '🏦' },
  { source: '이데일리', url: 'https://www.edaily.co.kr/rss/edaily_stock.xml', lang: 'ko', emoji: '🏦' },
  { source: 'Reuters',  url: 'https://feeds.reuters.com/reuters/businessNews', lang: 'en', emoji: '🌐' },
  { source: 'CNBC',     url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', lang: 'en', emoji: '📊' },
  { source: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories', lang: 'en', emoji: '📊' },
  { source: 'Investing.com', url: 'https://www.investing.com/rss/news_25.rss', lang: 'en', emoji: '💰' },
];

const MARKET_KW_KO = ['주식','증시','코스피','나스닥','S&P','금리','달러','환율','실적','관세','트럼프','연준','Fed','반도체','AI','인플레','채권','원유','금','펀드'];
const MARKET_KW_EN = ['stock','market','nasdaq','s&p','fed','rate','inflation','earnings','trade','tariff','trump','economy','gdp','rally','selloff','semiconductor','ai','bond','oil'];

function isMarket(title, lang) {
  const kw = lang === 'ko' ? MARKET_KW_KO : MARKET_KW_EN;
  const t = title.toLowerCase();
  return kw.some(k => t.includes(k.toLowerCase()));
}

function clean(str, len = 150) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0, len);
}

async function fetchFeed(feedInfo) {
  try {
    console.log(`  📡 ${feedInfo.source}`);
    const feed = await parser.parseURL(feedInfo.url);
    return feed.items.slice(0, 15).filter(i => i.title).map(i => ({
      title: clean(i.title),
      summary: clean(i.contentSnippet || i.summary || ''),
      link: i.link || '',
      pubDate: i.isoDate || i.pubDate || new Date().toISOString(),
      source: feedInfo.source,
      lang: feedInfo.lang,
      emoji: feedInfo.emoji,
      isMarketRelated: isMarket(i.title, feedInfo.lang),
    })).filter(i => i.title.length > 5);
  } catch (err) {
    console.log(`    ❌ ${feedInfo.source}: ${err.message}`);
    return [];
  }
}

// ── Claude API 호출 (ANTHROPIC_API_KEY 환경변수 필요) ──
function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { resolve(null); return; }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: '당신은 미국 주식 전문 애널리스트입니다. 오늘의 시장 데이터를 분석해 순수 JSON만 반환하세요. 마크다운 코드블록 금지.',
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          const txt = d.content?.map(c => c.text || '').join('') || '';
          resolve(JSON.parse(txt.replace(/```json|```/g, '').trim()));
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── 시장 요약 JSON 생성 ──
async function generateSummary(newsItems) {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateStr = `${kstNow.getFullYear()}년 ${kstNow.getMonth()+1}월 ${kstNow.getDate()}일`;

  // 시장 관련 뉴스 TOP 15개 추출해서 컨텍스트로 사용
  const marketNews = newsItems.filter(n => n.isMarketRelated).slice(0, 15);
  const newsContext = marketNews.map(n => `• [${n.source}] ${n.title}${n.summary ? '\n  ' + n.summary : ''}`).join('\n');

  const prompt = `오늘은 ${dateStr}입니다.

오늘 수집된 최신 뉴스 헤드라인:
${newsContext}

위 실제 뉴스를 바탕으로 ${dateStr} 미국증시·글로벌 시장 분석 JSON을 생성하세요.

다음 JSON 구조로 반환하세요:
{
  "date": "${dateStr}",
  "headline": "오늘 시장 핵심 한 문장 (수집된 뉴스 기반, 한국어 인용구 스타일)",
  "tags": ["#태그1","#태그2","#태그3","#태그4","#태그5","#태그6"],
  "points": [
    {
      "icon": "📌",
      "title": "이슈 제목 (15자 이내)",
      "desc": "3문장 한국어 상세 설명. 오늘 수집된 뉴스 기반. 구체적 수치 포함.",
      "links": [
        {"src":"Reuters","color":"#c8281f","title":"관련 기사","url":"https://www.reuters.com/markets/"},
        {"src":"한국경제","color":"#c8281f","title":"관련 기사","url":"https://www.hankyung.com/globalmarket"}
      ]
    }
  ],
  "experts": [
    {"quote":"전문가 코멘트 (오늘 뉴스 기반, 한국어)","name":"이름","role":"직책·소속","src":"Bloomberg","srcUrl":"https://www.bloomberg.com/markets"}
  ],
  "checklist": [
    {"icon":"✅","title":"체크 항목","desc":"오늘 뉴스 기반 구체적 행동 지침","url":"https://finance.yahoo.com/markets/","urlLabel":"Yahoo Finance"}
  ],
  "trump": {
    "summary": "오늘 트럼프 Truth Social 관련 시장 영향 요약 (2-3문장, 오늘 뉴스 기반)",
    "keywords": ["키워드1","키워드2","키워드3","키워드4","키워드5"],
    "sentiment": "bull",
    "tip": "오늘 트럼프 관련 투자 팁 한 문장"
  }
}

규칙:
- points 6개 이상. 오늘 수집된 실제 뉴스 헤드라인 기반으로 작성
- experts 3명. 오늘 이슈에 맞는 가상 전문가 코멘트
- checklist 5개. 오늘 뉴스 기반 실제 행동 가능한 항목
- trump.sentiment: "bull"(긍정적) / "bear"(부정적) / "neut"(중립)
- links URL은 실존 언론사 섹션만: reuters.com/markets, bloomberg.com/markets, cnbc.com/markets, wsj.com/market-data, ft.com/markets, hankyung.com/globalmarket, yna.co.kr/economy/stock, mk.co.kr/economy/stock-market, sedaily.com, finance.yahoo.com/markets
- 순수 JSON만 반환. 절대 마크다운 금지.`;

  console.log('\n🤖 Claude API로 시장 요약 생성 중...');
  const result = await callClaude(prompt);
  if (result) {
    console.log('✅ 시장 요약 생성 완료');
    return result;
  }

  // API 키 없거나 실패 시 뉴스 기반 기본 요약 생성
  console.log('⚠️  Claude API 미설정 — 뉴스 기반 기본 요약 생성');
  return generateFallbackSummary(newsItems, dateStr);
}

// Claude API 없을 때 뉴스만으로 요약 생성
function generateFallbackSummary(newsItems, dateStr) {
  const market = newsItems.filter(n => n.isMarketRelated);
  const koTop = market.filter(n => n.lang === 'ko').slice(0, 6);
  const enTop = market.filter(n => n.lang === 'en').slice(0, 3);

  const points = [...koTop, ...enTop].map((n, i) => ({
    icon: i === 0 ? '📌' : i < 3 ? '📊' : '📰',
    title: n.title.slice(0, 20),
    desc: n.summary || n.title,
    links: [
      { src: n.source, color: '#c8281f', title: n.title.slice(0, 30), url: n.link || 'https://www.reuters.com/markets/' }
    ]
  }));

  const newsListForTrump = market.filter(n => /트럼프|trump/i.test(n.title));
  const trumpSummary = newsListForTrump.length
    ? newsListForTrump.slice(0,2).map(n => n.title).join(' / ')
    : '오늘 트럼프 관련 주요 시장 영향 발언 모니터링 중.';

  return {
    date: dateStr,
    headline: koTop[0]?.title || '오늘의 글로벌 시장 동향을 확인하세요.',
    tags: market.slice(0, 6).map(n => '#' + n.title.slice(0, 8).replace(/\s/g, '')),
    points: points.slice(0, 6),
    experts: [
      { quote: '오늘 수집된 뉴스를 바탕으로 시장을 분석하고 있습니다. Claude API 키를 설정하면 전문가 코멘트가 자동 생성됩니다.', name: '마켓피드 AI', role: '자동 분석 시스템', src: 'GitHub Actions', srcUrl: 'https://github.com/wishwifi/wishwifi-news-kakao' }
    ],
    checklist: [
      { icon: '✅', title: '오늘의 주요 뉴스 확인', desc: koTop[0]?.title || '최신 시장 뉴스를 확인하세요', url: 'https://news.wishwifi.com', urlLabel: '마켓피드' },
      { icon: '✅', title: '글로벌 시장 동향', desc: enTop[0]?.title || 'Global market news', url: 'https://www.reuters.com/markets/', urlLabel: 'Reuters' },
      { icon: '⚠️', title: '환율·금리 변동 주시', desc: '원달러 환율과 미국 국채 금리 변동이 국내 증시에 영향', url: 'https://m.stock.naver.com/marketindex/', urlLabel: '네이버 환율' },
    ],
    trump: {
      summary: trumpSummary,
      keywords: ['관세', 'Fed', 'AI', '이란', '경제'],
      sentiment: 'neut',
      tip: '트럼프 관련 뉴스는 시장 변동성 확대 요인. 포지션 관리에 유의하세요.'
    }
  };
}

// ── Unsplash 이미지 키워드 매핑 ──
const UNSPLASH_KW_MAP = [
  { keys: ['트럼프','trump','관세','tariff','백악관'], query: 'donald trump white house' },
  { keys: ['반도체','semiconductor','chip','엔비디아','nvidia','AI','인공지능'], query: 'semiconductor technology chip' },
  { keys: ['금리','rate','연준','fed','powell'], query: 'federal reserve interest rate' },
  { keys: ['달러','dollar','환율','currency'], query: 'us dollar currency exchange' },
  { keys: ['유가','oil','원유','opec'], query: 'oil petroleum energy market' },
  { keys: ['나스닥','nasdaq','s&p','증시','stock market'], query: 'stock market nasdaq trading' },
  { keys: ['금','gold','은','silver'], query: 'gold bars investment' },
  { keys: ['이란','iran','중동','middle east'], query: 'middle east diplomacy' },
  { keys: ['부동산','real estate','주택'], query: 'real estate housing market' },
];

function getUnsplashKeyword(newsItems) {
  const titles = newsItems.slice(0, 5).map(n => n.title.toLowerCase()).join(' ');
  for (const kw of UNSPLASH_KW_MAP) {
    if (kw.keys.some(k => titles.includes(k.toLowerCase()))) {
      return kw.query;
    }
  }
  return 'stock market wall street finance';
}

async function fetchUnsplashImage(query) {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) return null;

  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const options = {
      hostname: 'api.unsplash.com',
      path: `/photos/random?query=${encodedQuery}&orientation=landscape&content_filter=high`,
      method: 'GET',
      headers: {
        'Authorization': `Client-ID ${apiKey}`,
        'Accept-Version': 'v1'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          // regular 사이즈 URL (1080px) — 카카오 호환
          const imgUrl = d.urls?.regular || d.urls?.full || null;
          console.log(`  🖼️  Unsplash 이미지: ${imgUrl?.slice(0,60) || '없음'}`);
          resolve(imgUrl);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ── 카카오 템플릿 생성 ──
function generateKakaoTemplate(newsItems, summary) {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateStr = kstNow.toISOString().slice(0, 10);
  const hour = kstNow.getUTCHours();
  const timeLabel = hour < 12 ? '아침' : hour < 18 ? '점심' : '저녁';

  const koNews = newsItems.filter(n => n.lang === 'ko' && n.isMarketRelated).slice(0, 5);
  const enNews = newsItems.filter(n => n.lang === 'en' && n.isMarketRelated).slice(0, 3);

  let msg = `📊 마켓피드 ${timeLabel} 브리핑\n${dateStr}\n`;
  if (summary?.headline) msg += `\n💬 "${summary.headline}"\n`;
  msg += `\n━━━━━━━━━━━━━━━\n🇰🇷 국내 주요 뉴스\n━━━━━━━━━━━━━━━\n\n`;
  koNews.forEach((n, i) => {
    msg += `${i + 1}. ${n.emoji} ${n.title}\n`;
    if (n.summary) msg += `   └ ${n.summary.slice(0, 60)}...\n`;
    msg += `   🔗 ${n.link}\n\n`;
  });
  msg += `━━━━━━━━━━━━━━━\n🌐 글로벌 뉴스\n━━━━━━━━━━━━━━━\n\n`;
  enNews.forEach((n, i) => {
    msg += `${i + 1}. ${n.emoji} ${n.title}\n   🔗 ${n.link}\n\n`;
  });
  msg += `━━━━━━━━━━━━━━━\n📈 전체 보기\nhttps://news.wishwifi.com\n\n💡 투자는 본인 책임 하에\n마켓피드 · news.wishwifi.com`;
  return msg;
}

// ── 메인 ──
async function main() {
  console.log('🚀 WishWifi 마켓피드 수집 시작...\n');

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // RSS 병렬 수집
  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  const allItems = results
    .filter(r => r.status === 'fulfilled').flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // 중복 제거
  const seen = new Set();
  const unique = allItems.filter(n => {
    const k = n.title.slice(0, 25);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  console.log(`\n📊 총 ${unique.length}개 뉴스 수집 (시장관련: ${unique.filter(n=>n.isMarketRelated).length}개)`);

  // news.json 저장
  const newsOutput = {
    updatedAt: new Date().toISOString(),
    updatedAtKST: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T',' ').slice(0,19) + ' KST',
    totalCount: unique.length,
    marketRelatedCount: unique.filter(n => n.isMarketRelated).length,
    items: unique,
  };
  fs.writeFileSync(path.join(dataDir, 'news.json'), JSON.stringify(newsOutput, null, 2), 'utf-8');
  console.log('✅ data/news.json 저장');

  // Claude API로 시장 요약 생성
  const summary = await generateSummary(unique);
  summary.updatedAt = new Date().toISOString();
  summary.updatedAtKST = newsOutput.updatedAtKST;

  // Unsplash 이미지 — 오늘 뉴스 키워드 기반 자동 선택
  const marketNews = unique.filter(n => n.isMarketRelated);
  const unsplashQuery = getUnsplashKeyword(marketNews);
  console.log(`\n🖼️  Unsplash 검색어: "${unsplashQuery}"`);
  const ogImage = await fetchUnsplashImage(unsplashQuery);
  summary.ogImage = ogImage || '';  // summary.json에 저장
  if (ogImage) console.log('✅ OG 이미지 저장 완료');
  else console.log('⚠️  Unsplash 이미지 없음 (UNSPLASH_ACCESS_KEY 설정 필요)');

  fs.writeFileSync(path.join(dataDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log('✅ data/summary.json 저장');

  // 카카오 템플릿
  const kakaoMsg = generateKakaoTemplate(unique, summary);
  fs.writeFileSync(path.join(dataDir, 'kakao-template.txt'), kakaoMsg, 'utf-8');
  console.log('✅ data/kakao-template.txt 저장');

  console.log('\n📱 카카오 메시지 미리보기:');
  console.log('─'.repeat(50));
  console.log(kakaoMsg.slice(0, 400));
}

main().catch(console.error);
