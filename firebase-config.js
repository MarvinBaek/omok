// ===== Firebase 설정 =====
const firebaseConfig = {
  apiKey: "AIzaSyCl1KMqk_FCWjld_Q1e5zRmaTeNg7Wezms",
  authDomain: "omok-stream.firebaseapp.com",
  databaseURL: "https://omok-stream-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "omok-stream",
  storageBucket: "omok-stream.firebasestorage.app",
  messagingSenderId: "472668336748",
  appId: "1:472668336748:web:85a40f7226f93db541de49"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===== 호스트 비밀번호 (SHA-256 + salt 해시) =====
// 원본 비밀번호: ticktok2026
const HOST_PWD_HASH = 'fb3198e9c360deaadfda946a430eb7eb582bca5c0df8087e3dfe27bbd8ede991';
const PWD_SALT = 'omok-marvin-2026-salt-xyz';

// SHA-256 헬퍼
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
