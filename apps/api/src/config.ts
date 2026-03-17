import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
if (isProd && !process.env.ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY must be set in production');
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  siteUrl: process.env.SITE_URL || 'https://union.pryzm.gg',
  uploadDir: process.env.UPLOAD_DIR || './uploads',

  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',

  jwtSecret: process.env.JWT_SECRET || 'change-me-in-development',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key',
  agentKeys: {
    'image-matching': process.env.AGENT_KEY_IMAGE_MATCHING || 'dev-agent-key-im',
    'promotion': process.env.AGENT_KEY_PROMOTION || 'dev-agent-key-promo',
    'chatbot-alert': process.env.AGENT_KEY_CHATBOT_ALERT || 'dev-agent-key-chat',
  } as Record<string, string>,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || '',
  kakaoAdminKey: process.env.KAKAO_ADMIN_KEY || '',
  kakaoChannelId: process.env.KAKAO_CHANNEL_ID || '',
  kakaoChannelPublicKey: process.env.KAKAO_CHANNEL_PUBLIC_KEY || '',
  kakaoRedirectUri: process.env.KAKAO_REDIRECT_URI || '',

  twitterApiKey: process.env.TWITTER_API_KEY || '',
  twitterApiSecret: process.env.TWITTER_API_SECRET || '',
  twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN || '',
  twitterAccessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',

  kakaoMapRestKey: process.env.KAKAO_MAP_REST_KEY || '',
  kakaoSenderKey: process.env.KAKAO_SENDER_KEY || '',

  smsApiKey: process.env.SMS_API_KEY || '',
  smsApiSecret: process.env.SMS_API_SECRET || '',
  smsFrom: process.env.SMS_FROM || '',

  publicDataApiKey: process.env.PUBLIC_DATA_API_KEY || '',
  safe182EsntlId: process.env.SAFE182_ESNTL_ID || '',
  safe182ApiKey: process.env.SAFE182_API_KEY || '',

  ghostAdminApiKey: process.env.GHOST_ADMIN_API_KEY || '',
  ghostApiUrl: process.env.GHOST_API_URL || 'https://union.pryzm.gg/devlog',
  devlogRepoPath: process.env.DEVLOG_REPO_PATH || process.cwd(),

  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidEmail: process.env.VAPID_EMAIL || 'mailto:admin@union.pryzm.gg',
  tossSecretKey: process.env.TOSS_SECRET_KEY || '',

  merchantWalletEvm:    process.env.MERCHANT_WALLET_EVM    || '',
  merchantWalletAptos:  process.env.MERCHANT_WALLET_APTOS  || '',
  merchantWalletSolana: process.env.MERCHANT_WALLET_SOLANA || '',
  aptosRpcUrl:          process.env.APTOS_RPC_URL     || 'https://api.mainnet.aptoslabs.com/v1',
  aptosRpcApiKey:       process.env.APTOS_RPC_API_KEY || '',
  solanaRpcUrl:         process.env.SOLANA_RPC_URL    || 'https://api.mainnet-beta.solana.com',

  googleClientId:     process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  googleCseApiKey:    process.env.GOOGLE_CSE_API_KEY || '',
  googleCseId:        process.env.GOOGLE_CSE_ID || '',
  youtubeApiKey:      process.env.YOUTUBE_API_KEY || '',
  outreachEmailFrom:  process.env.OUTREACH_EMAIL_FROM || 'findthem@union.pryzm.gg',

  naverClientId:     process.env.NAVER_CLIENT_ID || '',
  naverClientSecret: process.env.NAVER_CLIENT_SECRET || '',
  naverRedirectUri:  process.env.NAVER_REDIRECT_URI || '',

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
} as const;
