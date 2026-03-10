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
  uploadDir: process.env.UPLOAD_DIR || './uploads',

  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',

  jwtSecret: process.env.JWT_SECRET || 'change-me-in-development',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',

  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || '',
  kakaoAdminKey: process.env.KAKAO_ADMIN_KEY || '',
  kakaoChannelId: process.env.KAKAO_CHANNEL_ID || '',
  kakaoChannelPublicKey: process.env.KAKAO_CHANNEL_PUBLIC_KEY || '',
  kakaoRedirectUri: process.env.KAKAO_REDIRECT_URI || '',

  twitterApiKey: process.env.TWITTER_API_KEY || '',
  twitterApiSecret: process.env.TWITTER_API_SECRET || '',
  twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN || '',
  twitterAccessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',

  kakaoMapRestKey: process.env.KAKAO_MAP_REST_KEY || '',
  kakaoSenderKey: process.env.KAKAO_SENDER_KEY || '',

  smsApiKey: process.env.SMS_API_KEY || '',
  smsApiSecret: process.env.SMS_API_SECRET || '',
  smsFrom: process.env.SMS_FROM || '',
} as const;
