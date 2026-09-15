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

  openaiApiKey: required('OPENAI_API_KEY'),
  whisperModel: process.env.WHISPER_MODEL || 'whisper-1',

  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',

  limits: {
    audioMb: Number(process.env.MAX_AUDIO_MB || 25),
    videoMb: Number(process.env.MAX_VIDEO_MB || 200),
    documentMb: Number(process.env.MAX_DOCUMENT_MB || 20),
  },
};

export function isFirebaseConfigured() {
  return Boolean(env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey);
}

export function isWhisperConfigured() {
  return Boolean(env.openaiApiKey);
}

export function isClaudeConfigured() {
  return Boolean(env.anthropicApiKey);
}
