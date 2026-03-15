/**
 * Twitter API 키 테스트 스크립트
 * 실행: node scripts/test-twitter.mjs [--dry-run]
 */
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env 파싱
const envPath = resolve(process.cwd(), 'apps/api/.env');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const {
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET,
} = env;

if (!TWITTER_API_KEY || !TWITTER_ACCESS_TOKEN) {
  console.error('❌ Twitter API keys not found in apps/api/.env');
  process.exit(1);
}

function generateOAuthHeader(method, url) {
  const oauthParams = {
    oauth_consumer_key: TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  };

  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');

  const baseString = [method, encodeURIComponent(url), encodeURIComponent(sortedParams)].join('&');
  const signingKey = `${encodeURIComponent(TWITTER_API_SECRET)}&${encodeURIComponent(TWITTER_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

const isDryRun = process.argv.includes('--dry-run');
const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const tweetText = `[FindThem 테스트] 트위터 연동 확인 (${now})\n\nhttps://union.pryzm.gg\n#FindThem #개발로그`;

console.log('─'.repeat(60));
console.log('Tweet 내용:');
console.log(tweetText);
console.log(`\n글자 수: ${tweetText.length} (URL은 23자로 카운트)`);
console.log('─'.repeat(60));

if (isDryRun) {
  console.log('\n✅ --dry-run 모드: 실제 트윗 없이 종료');
  process.exit(0);
}

console.log('\n📤 트윗 전송 중...');

const url = 'https://api.twitter.com/2/tweets';
const authHeader = generateOAuthHeader('POST', url);

const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: tweetText }),
});

const body = await res.json();

if (!res.ok) {
  console.error('❌ Twitter API 오류:', res.status, JSON.stringify(body, null, 2));
  process.exit(1);
}

const tweetId = body.data?.id;
console.log(`✅ 트윗 성공!`);
console.log(`   ID: ${tweetId}`);
console.log(`   URL: https://x.com/i/status/${tweetId}`);
