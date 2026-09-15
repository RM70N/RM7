import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4100),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5500',

  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    clientEmail: required('FIREBASE_CLIENT_EMAIL'),
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    databaseURL: required('FIREBASE_DATABASE_URL'),
  },

  // تحويل الصوت إلى نص — Groq API (نموذج whisper-large-v3)
  groqApiKey: required('GROQ_API_KEY'),
  whisperModel: process.env.WHISPER_MODEL || 'whisper-large-v3',

  // التلخيص والتحليل الذكي + الرؤية (الصور) + المقارنة — Google Gemini API
  geminiApiKey: required('GEMINI_API_KEY'),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  limits: {
    audioMb: Number(process.env.MAX_AUDIO_MB || 25),
    videoMb: Number(process.env.MAX_VIDEO_MB || 200),
    documentMb: Number(process.env.MAX_DOCUMENT_MB || 20),
  },
};

export function isFirebaseConfigured() {
  return Boolean(env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey);
}

export function isGroqConfigured() {
  return Boolean(env.groqApiKey);
}

export function isGeminiConfigured() {
  return Boolean(env.geminiApiKey);
}
