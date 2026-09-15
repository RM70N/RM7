import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { lecturesRouter } from './routes/lectures.js';
import { coursesRouter } from './routes/courses.js';
import { usersRouter } from './routes/users.js';
import { raceRoomsRouter } from './routes/raceRooms.js';
import { studySessionsRouter } from './routes/studySessions.js';

const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/lectures', lecturesRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/users', usersRouter);
app.use('/api/race-rooms', raceRoomsRouter);
app.use('/api/study-sessions', studySessionsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`سيرفر لخّصلي شغّال على المنفذ ${env.port}`);
});
