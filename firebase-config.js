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
