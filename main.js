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

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let isMining = false;

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

// 🔄 User State Listener
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("authSection").style.display = "none";
    document.getElementById("miningSection").style.display = "block";
    await showBalance();
    loadLeaderboard();
    loadTransactions();
  } else {
    document.getElementById("authSection").style.display = "block";
    document.getElementById("miningSection").style.display = "none";
  }
});

// 💰 Show user balance
async function showBalance() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getDoc(doc(db, "miners", user.uid));
  const balance = userDoc.exists() ? (userDoc.data().balance || 0) : 0;

  document.getElementById("balanceDisplay").textContent = `💰 Balance: ${balance} coins`;
}

// ⛏️ Auto-Mining Loop
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
    let startTime = performance.now();

    while (!found && isMining) {
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
        const username = user.displayName || user.email || "Anonymous";
        const userRef = doc(db, "miners", userId);
        const userDoc = await getDoc(userRef);

        let balance = userDoc.exists() ? (userDoc.data().balance || 0) : 0;
        const newBalance = balance + points;

        await setDoc(userRef, {
          name: username,
          nonce: nonce,
          time: time,
          points: points,
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

// 🏆 Load Leaderboard
async function loadLeaderboard() {
  const leaderboard = document.getElementById("leaderboard");
  leaderboard.textContent = "🏆 Leaderboard:\n";

  const q = query(collection(db, "miners"), orderBy("balance", "desc"), limit(5));
  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((docSnap, index) => {
    const data = docSnap.data();
    const rank = index + 1;
    const name = data.name || "Unknown";
    const coins = data.balance ?? 0;
    leaderboard.textContent += `${rank}. ${name} - ${coins} coins\n`;
  });
}

// 💸 Send Coins
async function sendCoins() {
  const recipientEmail = document.getElementById("transferTo").value;
  const amount = parseInt(document.getElementById("transferAmount").value);
  const status = document.getElementById("transferStatus");
  const user = auth.currentUser;
  if (!user || !recipientEmail || isNaN(amount) || amount <= 0) {
    status.textContent = "❌ Invalid input.";
    return;
  }

  const senderRef = doc(db, "miners", user.uid);
  const senderDoc = await getDoc(senderRef);
  const senderBalance = senderDoc.exists() ? senderDoc.data().balance || 0 : 0;

  if (senderBalance < amount) {
    status.textContent = "❌ Insufficient balance.";
    return;
  }

  const users = await getDocs(collection(db, "miners"));
  let recipientId = null;
  users.forEach(docSnap => {
    if (docSnap.data().name === recipientEmail) {
      recipientId = docSnap.id;
    }
  });

  if (!recipientId) {
    status.textContent = "❌ Recipient not found.";
    return;
  }

  const recipientRef = doc(db, "miners", recipientId);
  const recipientDoc = await getDoc(recipientRef);
  const recipientBalance = recipientDoc.exists() ? recipientDoc.data().balance || 0 : 0;

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
    to: recipientEmail,
    amount,
    timestamp: new Date()
  });

  status.textContent = "✅ Transfer complete.";
  await showBalance();
  loadLeaderboard();
  loadTransactions();
}

// 📜 Load Transactions
async function loadTransactions() {
  const list = document.getElementById("transactionHistory
