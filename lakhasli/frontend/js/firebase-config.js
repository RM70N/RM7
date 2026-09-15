// إعدادات مشروع Firebase — هذه القيم عامة بطبيعتها (ليست سرية)،
// الحماية الفعلية تأتي من Firestore/Realtime Database Security Rules.
// عبّي القيم التالية من: Firebase Console > Project settings > Your apps > Web app
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  databaseURL: 'https://REPLACE_ME-default-rtdb.firebaseio.com',
  storageBucket: '', // ما نستخدم Firebase Storage بهذا المشروع
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const rtdb = getDatabase(firebaseApp);

// عنوان سيرفر الباك إند (Railway بالإنتاج، لوكال هوست أثناء التطوير)
export const API_BASE_URL = window.LAKHASLI_API_URL || 'http://localhost:4100';
