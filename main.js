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
  getDoc,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
  addDoc
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
let isMining = false;

// Auth Functions
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  signInWithEmailAndPassword(auth, email, password)
    .then(() => notify("✅ Logged in!"))
    .catch(err => notify("❌ " + err.message));
}

function signup() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  createUserWithEmailAndPassword(auth, email, password)
    .then(() => notify("✅ Account created!"))
    .catch(err => notify("❌ " + err.message));
}

function googleLogin() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider)
    .then(() => notify("✅ Google login successful!"))
    .catch(err => notify("❌ " + err.message));
}

function logout() {
  signOut(auth).then(() => notify("🔒 Logged out."));
}

onAuthStateChanged(auth, async (user) => {
  document.getElementById("authSection").style.display = user ? "none" : "block";
  document.getElementById("miningSection").style.display = user ? "block" : "none";
  if (user) {
    await showBalance();
    loadLeaderboard();
    loadTransactions();
  }
});

async function showBalance() {
  const user = auth.currentUser;
  if (!user) return;
  const docSnap = await getDoc(doc(db, "miners", user.uid));
  const balance = docSnap.exists() ? (docSnap.data().balance || 0) : 0;
  document.getElementById("balanceDisplay").textContent = `💰 Balance: ${balance} coins`;
}

async function startMining() {
  isMining = true;
  const output = document.getElementById("output");
  const progressBar = document.getElementById("progressBar");
  const encoder = new TextEncoder();
  const targetPrefix = '000';
  const maxNonce = 50000;

  while (isMining) {
    let nonce = 0;
    let found = false;
    output.textContent = "Mining...\n";
    const startTime = performance.now();

    while (!found && isMining) {
      const input = 'mine' + nonce;
      const hash = await crypto.subtle.digest('SHA-256', encoder.encode(input));
      const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');

      if (hashHex.startsWith(targetPrefix)) {
        const time = ((performance.now() - startTime) / 1000).toFixed(2);
        const points = Math.max(10, 1000 - Math.floor(nonce / 100));
        const user = auth.currentUser;
        const userId = user.uid;
        const username = user.displayName || user.email || "Anonymous";
        const userRef = doc(db, "miners", userId);
        const userDoc = await getDoc(userRef);
        const balance = userDoc.exists() ? (userDoc.data().balance || 0) : 0;
        const newBalance = balance + points;

        await setDoc(userRef, {
          name: username,
          nonce,
          time,
          points,
          balance: newBalance,
          date: new Date()
        });

        output.textContent += `✅ Block mined!\nHash: ${hashHex}\nNonce: ${nonce}\nTime: ${time}s\n+${points} coins\n`;
        await showBalance();
        await loadLeaderboard();
        found = true;
      }

      nonce++;
      if (nonce % 1000 === 0) {
        const percent = Math.min((nonce / maxNonce) * 100, 100);
        progressBar.style.width = `${percent}%`;
        await new Promise(r => setTimeout(r, 1));
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

function stopMining() {
  isMining = false;
  document.getElementById("output").textContent += "\n🛑 Mining stopped.";
}

async function loadLeaderboard() {
  const leaderboard = document.getElementById("leaderboard");
  leaderboard.textContent = "🏆 Leaderboard:\n";
  const q = query(collection(db, "miners"), orderBy("balance", "desc"), limit(5));
  const snap = await getDocs(q);
  snap.forEach((doc, i) => {
    const d = doc.data();
    leaderboard.textContent += `${i + 1}. ${d.name || "Unknown"} - ${d.balance || 0} coins\n`;
  });
}

async function sendCoins(e) {
  e.preventDefault();
  console.log("sendCoins() triggered");
  const toEmail = document.getElementById("transferTo").value;
  const amount = parseInt(document.getElementById("transferAmount").value);
  console.log("Recipient:", toEmail, "Amount:", amount);
  const user = auth.currentUser;
  if (!user || !toEmail || !amount || amount <= 0) {
    return notify("❌ Invalid input");
  }

  const senderRef = doc(db, "miners", user.uid);
  const senderDoc = await getDoc(senderRef);
  console.log("senderDoc.exists:", senderDoc.exists());
  const senderBalance = senderDoc.exists() ? senderDoc.data().balance || 0 : 0;
  console.log("Current senderBalance:", senderBalance);

  if (senderBalance < amount) {
    notify("❌ Insufficient balance");
    return;
  }

  // Find recipient
  const users = await getDocs(collection(db, "miners"));
  console.log("Total miners loaded:", users.size);
  let toId = null;
  users.forEach(docSnap => {
    console.log("checking user:", docSnap.data().name);
    if (docSnap.data().name === toEmail) {
      toId = docSnap.id;
      console.log("Recipient ID found:", toId);
    }
  });
  if (!toId) {
    return notify("❌ Recipient not found");
  }

  const recipientRef = doc(db, "miners", toId);
  const recipientDoc = await getDoc(recipientRef);
  const recipientBalance = recipientDoc.exists() ? recipientDoc.data().balance || 0 : 0;
  console.log("Recipient current balance:", recipientBalance);

  // Update balances
  await setDoc(senderRef, {
    ...senderDoc.data(),
    balance: senderBalance - amount
  });
  await setDoc(recipientRef, {
    ...recipientDoc.data(),
    balance: recipientBalance + amount
  });

  await addDoc(collection(db, "transactions"), {
    from: user.email,
    to: toEmail,
    amount,
    timestamp: new Date()
  });

  notify("✅ Transfer complete");
  await showBalance();
  await loadLeaderboard();
  await loadTransactions();
}


async function loadTransactions() {
  const list = document.getElementById("transactionHistory");
  list.innerHTML = "<strong>📄 Transaction History:</strong><br>";
  const user = auth.currentUser;
  if (!user) return;
  const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(10));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const d = doc.data();
    if (d.from === user.email || d.to === user.email) {
      const t = d.timestamp?.toDate().toLocaleString() || "";
      list.innerHTML += `🕓 ${t}: ${d.from} ➡️ ${d.to} — ${d.amount} coins<br>`;
    }
  });
}

function notify(msg) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #333; color: white; padding: 10px 20px; border-radius: 6px; z-index: 9999;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Button Listeners
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("signupBtn").addEventListener("click", signup);
document.getElementById("googleLoginBtn").addEventListener("click", googleLogin);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("startMiningBtn").addEventListener("click", startMining);
document.getElementById("stopMiningBtn").addEventListener("click", stopMining);
document.getElementById("transferForm").addEventListener("submit", sendCoins);
