import express from 'express';
import cors from 'cors';
import path from 'path';
import 'express-async-errors';
import { config } from './config.js';
import { errorHandler } from './middlewares/errors.js';
import { createRouter } from './routes/index.js';

const app = express();

// 미들웨어
app.use(cors({
  origin: [
    config.webOrigin,
    'capacitor://localhost',   // iOS Capacitor
    'http://localhost',        // Android Capacitor
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
