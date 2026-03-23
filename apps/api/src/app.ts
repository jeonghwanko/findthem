import express from 'express';
import cors from 'cors';
import path from 'path';
import 'express-async-errors';
import { config } from './config.js';
import { errorHandler } from './middlewares/errors.js';
import { createRouter } from './routes/index.js';

const app = express();

// Nginx 역방향 프록시 뒤에서 실제 클라이언트 IP를 req.ip로 전달받기 위해 필요
// 미설정 시 req.ip가 항상 127.0.0.1이 되어 rate limiter가 무력화됨
app.set('trust proxy', 1);

// 미들웨어
app.use(cors({
  origin: [
    config.webOrigin,
    'capacitor://localhost',   // iOS Capacitor
    'http://localhost',        // Android Capacitor (legacy)
    'https://localhost',       // Android Capacitor 7+ (기본 androidScheme: https)
  ],
  credentials: true,
}));
app.use(express.json());

// 정적 파일 (업로드)
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// API 라우트
app.use('/api', createRouter());

// 에러 핸들러
app.use(errorHandler);

export { app };
