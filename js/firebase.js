/* ==========================================================================
   Firebase — نفس مشروع ehsmaha.com (streamgame-180b8) ونفس قاعدة البيانات.
   أي كتابة هنا تنعكس فوراً على الموقع الأساسي، والعكس صحيح.
   ملاحظة: apiKey في إعداد الويب ليست سرّاً — الحماية الفعلية من firestore.rules.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
  collection, onSnapshot, query, where, orderBy, limit, getDocs, increment, arrayUnion,
  deleteField, addDoc, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCo37Dpu-tYccZcfgHqttJfh9vgOj0bTEE",
  authDomain: "streamgame-180b8.firebaseapp.com",
  projectId: "streamgame-180b8",
  storageBucket: "streamgame-180b8.firebasestorage.app",
  messagingSenderId: "149723106437",
  appId: "1:149723106437:web:b17b83b755f086998d2dec",
  measurementId: "G-1QEFDGRFT9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

/* هوية المالك المثبّتة مسبقاً — مطابقة لـ ehsmaha (index4). لا تسجيل حسابات جديدة. */
export const OWNER = {
  email: "malshaifan1@gmail.com",
  username: "MZX"
};

/** هل هذا المستخدم هو المالك المصرّح له؟ (تحقّق مزدوج: بريد + يوزر) */
export function isOwner(user, username) {
  if (!user) return false;
  const em = (user.email || "").toLowerCase();
  const un = (username || "").toLowerCase();
  return em === OWNER.email.toLowerCase() || un === OWNER.username.toLowerCase();
}

/* كائن موحّد يُصدّر كل ما تحتاجه الصفحات — بدون تكرار الاستيراد في كل ملف. */
export const fb = {
  app, auth, db,
  // auth
  onAuthStateChanged, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut,
  // firestore
  doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
  collection, onSnapshot, query, where, orderBy, limit, getDocs, increment, arrayUnion,
  deleteField, addDoc, writeBatch, Timestamp
};

export default fb;
