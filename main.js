// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
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
  addDoc,
  deleteDoc,
  where
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

const ADMIN_EMAIL = "youradmin@email.com"; // Replace with your admin email

async function signup() {
  const username = document.getElementById("signupUsername").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "miners", userCred.user.uid), {
      username,
      email,
      balance: 0
    });
    notify("✅ Account created!");
  } catch (err) {
    notify("❌ " + err.message);
  }
}

async function login() {
  try {
    const email = document.getElementById("loginUsername").value.trim(); // now email input
    const password = document.getElementById("loginPassword").value;

    const userCred = await signInWithEmailAndPassword(auth, email, password);

    // Get username from Firestore
    const docSnap = await getDoc(doc(db, "miners", userCred.user.uid));
    const username = docSnap.exists() ? docSnap.data().username : "Unknown";

    notify("✅ Logged in as " + username);
  } catch (err) {
    notify("❌ " + err.message);
  }
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

async function resetPassword() {
  const email = prompt("Enter your email to reset password:");
  if (!email) return;
  try {
    await sendPasswordResetEmail(auth, email);
    notify("📧 Password reset email sent.");
  } catch (err) {
    notify("❌ " + err.message);
  }
}

async function banUserByUsername() {
  const username = prompt("Enter username to ban:");
  if (!username) return;

  const q = query(collection(db, "miners"), where("username", "==", username));
  const snap = await getDocs(q);
  if (snap.empty) return notify("❌ User not found");

  await deleteDoc(doc(db, "miners", snap.docs[0].id));
  notify("🚫 User banned");
}

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
        const userRef = doc(db, "miners", userId);
        const userDoc = await getDoc(userRef);
        const data = userDoc.data();
        const newBalance = (data.balance || 0) + points;

        await setDoc(userRef, {
          ...data,
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
    leaderboard.textContent += `${i + 1}. ${d.username || "Unknown"} - ${d.balance || 0} coins\n`;
  });
}

async function sendCoins(e) {
  e.preventDefault();

  const toUsername = document.getElementById("transferTo").value.trim();
  const amount = parseInt(document.getElementById("transferAmount").value);
  const user = auth.currentUser;
  if (!user || !toUsername || !amount || amount <= 0) return notify("❌ Invalid input");

  try {
    const senderRef = doc(db, "miners", user.uid);
    const senderSnap = await getDoc(senderRef);
    if (!senderSnap.exists()) return notify("❌ Sender account not found");

    const senderData = senderSnap.data();
    const senderBalance = senderData.balance || 0;

    // Prevent self-transfer
    if (toUsername.toLowerCase() === senderData.username?.toLowerCase()) {
      return notify("❌ Cannot transfer coins to yourself");
    }

    if (senderBalance < amount) return notify("❌ Insufficient balance");

    const q = query(collection(db, "miners"), where("username", "==", toUsername));
    const userSnap = await getDocs(q);
    if (userSnap.empty) return notify("❌ Recipient not found");

    const recipientDoc = userSnap.docs[0];
    const recipientData = recipientDoc.data();
    const recipientRef = doc(db, "miners", recipientDoc.id);

    const newSenderBalance = senderBalance - amount;
    const newRecipientBalance = (recipientData.balance || 0) + amount;

    await Promise.all([
      setDoc(senderRef, { ...senderData, balance: newSenderBalance }),
      setDoc(recipientRef, { ...recipientData, balance: newRecipientBalance }),
      addDoc(collection(db, "transactions"), {
        from: senderData.email,
        to: recipientData.email,
        amount,
        timestamp: new Date()
      })
    ]);

    notify("✅ Transfer complete");
    await showBalance();
    await loadLeaderboard();
    await loadTransactions();
  } catch (err) {
    console.error(err);
    notify("❌ Transfer failed: " + err.message);
  }
}


  notify("✅ Transfer complete");
  await showBalance();
  loadLeaderboard();
  loadTransactions();
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

async function submitComplaint() {
  const textarea = document.getElementById("complaintText");
  const complaint = textarea?.value.trim();
  const user = auth.currentUser;
  if (!complaint || !user) return notify("❌ Please enter a complaint.");
  await addDoc(collection(db, "complaints"), {
    uid: user.uid,
    email: user.email,
    complaint,
    timestamp: new Date()
  });
  textarea.value = "";
  notify("📨 Complaint submitted.");
  document.getElementById("complaintPopup").style.display = "none";
}

async function loadComplaints() {
  const container = document.getElementById("complaintList");
  if (!container) return;
  container.innerHTML = "Loading complaints...";
  const snap = await getDocs(query(collection(db, "complaints"), orderBy("timestamp", "desc")));
  container.innerHTML = "";
  snap.forEach(doc => {
    const d = doc.data();
    const item = document.createElement("div");
    item.style.borderBottom = "1px solid #555";
    item.style.padding = "5px 0";
    item.innerHTML = `<strong>${d.email}</strong><br>${d.complaint}<br><small>${d.timestamp.toDate().toLocaleString()}</small>`;
    container.appendChild(item);
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
document.getElementById("signupBtn")?.addEventListener("click", signup);
document.getElementById("loginBtn")?.addEventListener("click", login);
document.getElementById("googleLoginBtn")?.addEventListener("click", googleLogin);
document.getElementById("logoutBtn")?.addEventListener("click", logout);
document.getElementById("startMiningBtn")?.addEventListener("click", startMining);
document.getElementById("stopMiningBtn")?.addEventListener("click", stopMining);
document.getElementById("transferForm")?.addEventListener("submit", sendCoins);
document.getElementById("resetPasswordBtn")?.addEventListener("click", resetPassword);
document.getElementById("banUserBtn")?.addEventListener("click", () => {
  if (auth.currentUser?.email === ADMIN_EMAIL) banUserByUsername();
  else notify("🔐 Admins only");
});
document.getElementById("complaintBtn")?.addEventListener("click", () => {
  document.getElementById("complaintPopup").style.display = "block";
});
document.getElementById("submitComplaint")?.addEventListener("click", submitComplaint);

// Auto-display mining section if user is logged in
onAuthStateChanged(auth, async (user) => {
  const isAdmin = user?.email === ADMIN_EMAIL;
  document.getElementById("authSection").style.display = user ? "none" : "block";
  document.getElementById("miningSection").style.display = user ? "block" : "none";
  document.getElementById("adminPanel")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("adminPanel")?.style.setProperty("display", isAdmin ? "block" : "none");

  if (user) {
    await showBalance();
    loadLeaderboard();
    loadTransactions();
    const userDoc = await getDoc(doc(db, "miners", user.uid));
    const username = userDoc.exists() ? userDoc.data().username : "Unknown";
    document.getElementById("welcomeUser").textContent = `👋 Welcome, ${username}`;
    if (isAdmin) loadComplaints();
  }
});
