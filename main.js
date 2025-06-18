// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  setDoc,
  doc,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDCegRtUMSNTtNeDsFt8AbY3h5oxzIujdw",
  authDomain: "superime-miners.firebaseapp.com",
  projectId: "superime-miners",
  storageBucket: "superime-miners.appspot.com",
  messagingSenderId: "57805313400",
  appId: "G-N3F9VECF1H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🔐 Auth Functions
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  signInWithEmailAndPassword(auth, email, password)
    .then(() => {
      document.getElementById("authStatus").textContent = "✅ Logged in!";
    })
    .catch(err => {
      document.getElementById("authStatus").textContent = "❌ " + err.message;
    });
}

function signup() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  createUserWithEmailAndPassword(auth, email, password)
    .then(() => {
      document.getElementById("authStatus").textContent = "✅ Account created!";
    })
    .catch(err => {
      document.getElementById("authStatus").textContent = "❌ " + err.message;
    });
}

function googleLogin() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider)
    .then(() => {
      document.getElementById("authStatus").textContent = "✅ Google login successful!";
    })
    .catch(err => {
      document.getElementById("authStatus").textContent = "❌ " + err.message;
    });
}

function logout() {
  signOut(auth).then(() => {
    document.getElementById("authStatus").textContent = "🔒 Logged out.";
  });
}

// 🔄 State Listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("authSection").style.display = "none";
    document.getElementById("miningSection").style.display = "block";
    loadLeaderboard();
  } else {
    document.getElementById("authSection").style.display = "block";
    document.getElementById("miningSection").style.display = "none";
  }
});

// ⛏️ Mining Logic
async function startMining() {
  const output = document.getElementById("output");
  const progressBar = document.getElementById("progressBar");
  const encoder = new TextEncoder();
  const targetPrefix = '000';
  let nonce = 0;
  let startTime = performance.now();
  let found = false;
  output.textContent = "Mining started...\n";
  progressBar.style.width = "0%";
  const maxNonce = 50000;

  while (!found) {
    const input = 'mine' + nonce;
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex.startsWith(targetPrefix)) {
      let endTime = performance.now();
      const time = ((endTime - startTime) / 1000).toFixed(2);
      const points = 1000 - Math.floor(nonce / 100);

      const user = auth.currentUser;
      const userId = user.uid;
      const username = user.email;

      output.textContent += `✅ Success!\nNonce: ${nonce}\nHash: ${hashHex}\nTime: ${time}s\nPoints Earned: ${points}`;

      await setDoc(doc(db, "miners", userId), {
        name: username,
        nonce: nonce,
        time: time,
        points: points,
        date: new Date()
      });

      loadLeaderboard();
      found = true;
    }

    nonce++;
    if (nonce % 1000 === 0) {
      const percent = Math.min((nonce / maxNonce) * 100, 100);
      progressBar.style.width = `${percent}%`;
      await new Promise(r => setTimeout(r, 1));
    }
  }
}

// 🏆 Leaderboard
async function loadLeaderboard() {
  const leaderboard = document.getElementById("leaderboard");
  leaderboard.textContent = "🏆 Leaderboard:\n";

  const q = query(collection(db, "miners"), orderBy("points", "desc"), limit(5));
  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((docSnap, index) => {
    const data = docSnap.data();

    const rank = index + 1;
    const name = data.name || "Unknown";
    const points = data.points ?? 0;
    const time = data.time ?? "?";

    leaderboard.textContent += `${rank}. ${name} - ${points} pts (${time}s)\n`;
  });
}


// 🔓 Bind Buttons to Functions
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("signupBtn").addEventListener("click", signup);
document.getElementById("googleLoginBtn").addEventListener("click", googleLogin);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("startMiningBtn").addEventListener("click", startMining);
