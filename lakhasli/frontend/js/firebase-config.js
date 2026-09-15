// إعدادات مشروع Firebase — هذه القيم عامة بطبيعتها (ليست سرية)،
// الحماية الفعلية تأتي من Firestore/Realtime Database Security Rules.
// عبّي القيم التالية من: Firebase Console > Project settings > Your apps > Web app
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC5Kzsr0xV1q51BiP-xWpo48kihU2Xx4Xw',
  authDomain: 'lakshle.firebaseapp.com',
  projectId: 'lakshle',
  // تأكد من هذا الرابط بعد إنشاء Realtime Database فعليًا من الكونسول —
  // إذا اخترت موقع غير us-central1 بيكون الرابط بصيغة:
  // https://lakshle-default-rtdb.<region>.firebasedatabase.app
  databaseURL: 'https://lakshle-default-rtdb.firebaseio.com',
  storageBucket: '', // ما نستخدم Firebase Storage بهذا المشروع (القيمة الأصلية: lakshle.firebasestorage.app)
  messagingSenderId: '83706359590',
  appId: '1:83706359590:web:5da27ebc95d85aeb529be7',
  measurementId: 'G-JQ92Q2YPKR',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const rtdb = getDatabase(firebaseApp);

// عنوان سيرفر الباك إند (Railway بالإنتاج، لوكال هوست أثناء التطوير)
export const API_BASE_URL = window.LAKHASLI_API_URL || 'http://localhost:4100';
