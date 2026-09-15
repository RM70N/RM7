import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { auth } from './firebase-config.js';

const googleProvider = new GoogleAuthProvider();

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
}

export async function loginWithGoogle() {
  await signInWithPopup(auth, googleProvider);
}

export async function logout() {
  await signOut(auth);
}

/**
 * يحمي صفحة معيّنة: يحوّل لصفحة الدخول إذا ما فيه مستخدم مسجّل.
 * @returns {Promise<import('firebase/auth').User>}
 */
export function requireUser() {
  return new Promise((resolve) => {
    const unsubscribe = watchAuth((user) => {
      unsubscribe();
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
      resolve(user);
    });
  });
}

export function authErrorToArabic(err) {
  const map = {
    'auth/invalid-email': 'البريد الإلكتروني غير صحيح.',
    'auth/user-not-found': 'ما فيه حساب بهذا البريد.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/invalid-credential': 'بيانات الدخول غير صحيحة.',
    'auth/email-already-in-use': 'هذا البريد مستخدم مسبقًا.',
    'auth/weak-password': 'كلمة المرور ضعيفة، لازم تكون 6 أحرف على الأقل.',
    'auth/popup-closed-by-user': 'تم إغلاق نافذة الدخول قبل إكمال العملية.',
    'auth/network-request-failed': 'فشل الاتصال بالإنترنت. تحقق من اتصالك وحاول مرة ثانية.',
  };
  return map[err?.code] || 'صار خطأ غير متوقع. حاول مرة ثانية.';
}
