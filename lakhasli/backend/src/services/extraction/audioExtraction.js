import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import os from 'node:os';
import path from 'node:path';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * يستخرج مسار الصوت من ملف فيديو إلى ملف mp3 مؤقت (للتفريغ عبر Whisper).
 * @param {string} videoPath
 * @returns {Promise<string>} مسار ملف الصوت المؤقت
 */
export function extractAudioFromVideo(videoPath) {
  const outputPath = path.join(os.tmpdir(), `lakhasli-audio-${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .format('mp3')
      .on('error', (err) => {
        logger.error('فشل استخراج الصوت من الفيديو:', err);
        reject(new AppError(500, 'ما قدرنا نستخرج الصوت من الفيديو. تأكد إن الملف غير تالف.'));
      })
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}
