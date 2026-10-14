import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_Y51uP5wDkl_dwraVS_7E4Uootcao0_4",
  authDomain: "quest-logg.firebaseapp.com",
  projectId: "quest-logg",
  storageBucket: "quest-logg.firebasestorage.app",
  messagingSenderId: "730905928054",
  appId: "1:730905928054:web:8c826c2ead4837a71a9a57",
  measurementId: "G-M84659HZXR",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

(() => {
  const STORAGE_KEY = "questlog-v1";
  const DIFFICULTIES = {
    easy: { label: "Mudah", xp: 10 },
    medium: { label: "Sedang", xp: 25 },
    hard: { label: "Sulit", xp: 50 },
  };
  const RANKS = [
    { title: "Murid Baru", avatar: "🧙" },
    { title: "Petualang", avatar: "🧝" },
    { title: "Pejuang", avatar: "🛡️" },
    { title: "Ksatria", avatar: "⚔️" },
    { title: "Penyihir Agung", avatar: "🔮" },
    { title: "Pahlawan", avatar: "👑" },
    { title: "Legenda", avatar: "🐉" },
  ];
  const BADGES = [
    { id: "first", icon: "🌱", name: "Langkah pertama", description: "1 quest selesai", earned: (state, stats) => stats.completed.length >= 1 },
    { id: "streak", icon: "🔥", name: "Streak 3 hari", description: "Streak mencapai 3", earned: (state) => state.bestStreak >= 3 },
    { id: "ten", icon: "💪", name: "10 quest beres", description: "10 quest selesai", earned: (state, stats) => stats.completed.length >= 10 },
    { id: "hard", icon: "🐲", name: "Penakluk sulit", description: "3 quest Sulit selesai", earned: (state, stats) => stats.hardCompleted >= 3 },
    { id: "level-five", icon: "⭐", name: "Level 5", description: "Capai level 5", earned: (state, stats) => stats.level >= 5 },
  ];

  const elements = {
    form: document.querySelector("#quest-form"),
    name: document.querySelector("#quest-name"),
    difficulty: document.querySelector("#quest-difficulty"),
    deadline: document.querySelector("#quest-deadline"),
    avatar: document.querySelector("#character-avatar"),
    rank: document.querySelector("#character-title"),
    level: document.querySelector("#character-level"),
    xpText: document.querySelector("#xp-text"),
    xpProgress: document.querySelector("#xp-progress"),
    xpFill: document.querySelector("#xp-fill"),
    streak: document.querySelector("#streak-value"),
    completed: document.querySelector("#completed-value"),
    badges: document.querySelector("#badge-list"),
    questCount: document.querySelector("#quest-count"),
    questList: document.querySelector("#quest-list"),
    toastRegion: document.querySelector("#toast-region"),
    filterTabs: document.querySelectorAll(".filter-tab"),
    loginButton: document.querySelector("#login-button"),
    logoutButton: document.querySelector("#logout-button"),
    userInfo: document.querySelector("#user-info"),
    syncStatus: document.querySelector("#sync-status"),
    loginPrompt: document.querySelector("#login-prompt"),
  };

  let activeFilter = "active";
  let toastQueue = [];
  let toastShowing = false;
  let state = loadState();
  let currentUser = null;
  let stopSnapshot = null;
  let cloudReady = false;
  let cloudLoadFailed = false;
  let pendingSave = null;
  let cloudWriteChain = Promise.resolve();
  let lastSnapshotJson = "";
  let applyingRemoteSnapshot = false;

  function createDefaultState() {
    return {
      quests: [],
      totalXp: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastCompletedDate: null,
      nid: 1,
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return createDefaultState();
      return normalizeState(JSON.parse(saved));
    } catch (error) {
      queueToast("Data tersimpan tidak dapat dibaca", true);
      console.error("Gagal membaca data Quest Log:", error);
      return createDefaultState();
    }
  }

  function normalizeState(data) {
    if (!data || !Array.isArray(data.quests)) {
      throw new Error("Data penyimpanan Quest Log tidak valid.");
    }
    const totalXp = Number.isFinite(data.totalXp) ? data.totalXp : Number.isFinite(data.xp) ? data.xp : 0;
    const quests = data.quests.filter(isValidQuest);
    return {
      quests,
      totalXp: Math.max(0, totalXp),
      currentStreak: Math.max(0, Number.isFinite(data.currentStreak) ? data.currentStreak : Number.isFinite(data.streak) ? data.streak : 0),
      bestStreak: Math.max(0, Number.isFinite(data.bestStreak) ? data.bestStreak : Number.isFinite(data.best) ? data.best : 0),
      lastCompletedDate: typeof data.lastCompletedDate === "string"
        ? data.lastCompletedDate
        : typeof data.last === "string" ? data.last : null,
      nid: Math.max(1, Number.isSafeInteger(data.nid) ? data.nid : 1),
    };
  }

  function isValidQuest(quest) {
    return Boolean(
      quest &&
      typeof quest.id === "string" &&
      typeof quest.name === "string" &&
      Object.hasOwn(DIFFICULTIES, quest.difficulty) &&
      typeof quest.completed === "boolean"
    );
  }

  function serializeState(sourceState = state) {
    const completed = sourceState.quests.filter((quest) => quest.completed);
    return {
      quests: sourceState.quests,
      xp: sourceState.totalXp,
      level: getLevelInfo(sourceState.totalXp).level,
      done: completed.length,
      hard: completed.filter((quest) => quest.difficulty === "hard").length,
      streak: sourceState.currentStreak,
      best: sourceState.bestStreak,
      last: sourceState.lastCompletedDate,
      nid: sourceState.nid,
    };
  }

  function saveLocalState(uid = currentUser?.uid) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
      if (uid) localStorage.setItem(`${STORAGE_KEY}-owner`, uid);
      return true;
    } catch (error) {
      queueToast("Data gagal disimpan. Periksa ruang penyimpanan browser.", true);
      console.error("Gagal menyimpan data Quest Log:", error);
      return false;
    }
  }

  function loadLocalOwner() {
    try {
      return localStorage.getItem(`${STORAGE_KEY}-owner`);
    } catch (error) {
      console.error("Gagal membaca pemilik cadangan lokal Quest Log:", error);
      return null;
    }
  }

  function hasLocalProgress(sourceState) {
    return sourceState.quests.length > 0 ||
      sourceState.totalXp > 0 ||
      sourceState.currentStreak > 0 ||
      sourceState.bestStreak > 0 ||
      sourceState.lastCompletedDate !== null;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function getLevelInfo(totalXp) {
    let level = 1;
    let xpRemaining = totalXp;
    let xpNeeded = 100;
    while (xpRemaining >= xpNeeded) {
      xpRemaining -= xpNeeded;
      level += 1;
      xpNeeded = 100 + (level - 1) * 50;
    }
    return { level, xp: xpRemaining, needed: xpNeeded };
  }

  function getTodayKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getYesterdayKey() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, "0");
    const day = String(yesterday.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getVisibleStreak() {
    if (state.lastCompletedDate === getTodayKey() || state.lastCompletedDate === getYesterdayKey()) {
      return state.currentStreak;
    }
    return 0;
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })
      .format(new Date(year, month - 1, day));
  }

  function getQuestStats() {
    const completed = state.quests.filter((quest) => quest.completed);
    return {
      completed,
      hardCompleted: completed.filter((quest) => quest.difficulty === "hard").length,
      level: getLevelInfo(state.totalXp).level,
    };
  }

  function renderCharacter(previousLevel) {
    const info = getLevelInfo(state.totalXp);
    const rank = RANKS[Math.min(Math.floor((info.level - 1) / 2), RANKS.length - 1)];
    elements.avatar.textContent = rank.avatar;
    elements.rank.textContent = rank.title;
    elements.level.textContent = String(info.level);
    elements.xpText.textContent = `${info.xp} / ${info.needed} XP`;
    elements.xpFill.style.width = `${(info.xp / info.needed) * 100}%`;
    elements.xpProgress.setAttribute("aria-valuenow", String(Math.round((info.xp / info.needed) * 100)));
    elements.xpProgress.setAttribute("aria-valuetext", `${info.xp} dari ${info.needed} XP`);
    elements.streak.textContent = String(getVisibleStreak());
    elements.completed.textContent = String(getQuestStats().completed.length);
    if (previousLevel !== undefined && info.level > previousLevel) {
      elements.level.classList.remove("level-up");
      void elements.level.offsetWidth;
      elements.level.classList.add("level-up");
      elements.level.addEventListener("animationend", () => elements.level.classList.remove("level-up"), { once: true });
    }
  }

  function renderBadges() {
    const stats = getQuestStats();
    elements.badges.innerHTML = BADGES.map((badge) => {
      const earned = badge.earned(state, stats);
      return `
        <div class="badge${earned ? " is-earned" : ""}"${earned ? ' aria-label="Lencana didapat: ' + badge.name + '"' : ' aria-label="Lencana belum didapat: ' + badge.name + '"'}>
          <span class="badge-icon" aria-hidden="true">${badge.icon}</span>
          <span>
            <span class="badge-name">${badge.name}</span>
            <span class="badge-description">${badge.description}</span>
          </span>
        </div>`;
    }).join("");
  }

  function isOverdue(quest) {
    return Boolean(quest.deadline && !quest.completed && quest.deadline < getTodayKey());
  }

  function getVisibleQuests() {
    let quests = state.quests;
    if (activeFilter === "active") {
      quests = quests.filter((quest) => !quest.completed);
      quests = [...quests].sort((a, b) => {
        if (!a.deadline && !b.deadline) return a.createdAt - b.createdAt;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline) || a.createdAt - b.createdAt;
      });
    } else if (activeFilter === "completed") {
      quests = quests.filter((quest) => quest.completed);
      quests = [...quests].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    } else {
      quests = [...quests].sort((a, b) => b.createdAt - a.createdAt);
    }
    return quests;
  }

  function renderQuests() {
    const quests = getVisibleQuests();
    elements.questCount.textContent = `${quests.length} QUEST`;

    if (quests.length === 0) {
      const emptyContent = activeFilter === "active"
        ? ["Papan misi masih kosong", "Tambahkan quest pertamamu dan mulai kumpulkan XP!"]
        : activeFilter === "completed"
          ? ["Belum ada quest selesai", "Tandai quest yang sudah kamu tuntaskan untuk mendapat XP."]
          : ["Belum ada quest", "Petualangan besar dimulai dari satu quest kecil."];
      elements.questList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🗺️</span>
          <strong>${emptyContent[0]}</strong>
          <p>${emptyContent[1]}</p>
        </div>`;
      return;
    }

    elements.questList.innerHTML = quests.map((quest) => {
      const difficulty = DIFFICULTIES[quest.difficulty];
      const overdue = isOverdue(quest);
      const metadata = [
        `<span class="difficulty-tag ${quest.difficulty}">${difficulty.label}</span>`,
        quest.deadline ? `<span class="deadline-tag">📅 ${formatDate(quest.deadline)}</span>` : "",
        overdue ? '<span class="overdue-tag">Terlambat</span>' : "",
      ].filter(Boolean).join("");
      return `
        <article class="quest-card difficulty-${quest.difficulty}${quest.completed ? " is-completed" : ""}${overdue ? " is-overdue" : ""}">
          <button
            class="complete-button"
            type="button"
            data-action="complete"
            data-id="${escapeHtml(quest.id)}"
            aria-label="${quest.completed ? "Quest sudah selesai" : "Selesaikan quest " + escapeHtml(quest.name)}"
            ${quest.completed ? "disabled" : ""}
          >${quest.completed ? "✓" : ""}</button>
          <div class="quest-content">
            <h3 class="quest-title">${escapeHtml(quest.name)}</h3>
            <div class="quest-meta">${metadata}</div>
          </div>
          <span class="quest-xp">+${difficulty.xp} XP</span>
          <button
            class="delete-button"
            type="button"
            data-action="delete"
            data-id="${escapeHtml(quest.id)}"
            aria-label="Hapus quest ${escapeHtml(quest.name)}"
          >×</button>
        </article>`;
    }).join("");
  }

  function render() {
    renderCharacter();
    renderBadges();
    renderQuests();
  }

  function queueToast(message, isError = false) {
    toastQueue.push({ message, isError });
    showNextToast();
  }

  function showNextToast() {
    if (toastShowing || toastQueue.length === 0 || !elements.toastRegion) return;
    toastShowing = true;
    const item = toastQueue.shift();
    const toast = document.createElement("div");
    toast.className = `toast${item.isError ? " is-error" : ""}`;
    toast.textContent = item.message;
    elements.toastRegion.append(toast);
    window.setTimeout(() => {
      toast.remove();
      toastShowing = false;
      showNextToast();
    }, 2300);
  }

  function setSyncStatus(message, isError = false) {
    elements.syncStatus.textContent = message;
    elements.syncStatus.classList.toggle("is-error", isError);
  }

  function updateAuthUi() {
    const signedIn = Boolean(currentUser);
    elements.loginButton.hidden = signedIn;
    elements.logoutButton.hidden = !signedIn;
    elements.userInfo.hidden = !signedIn;
    elements.userInfo.textContent = currentUser
      ? [currentUser.displayName, currentUser.email].filter(Boolean).join(" · ")
      : "";
    elements.loginPrompt.hidden = signedIn;
    elements.form.hidden = !signedIn || !cloudReady;
  }

  function describeFirebaseError(error) {
    if (error?.code === "permission-denied" || error?.code === "firestore/permission-denied") {
      return "Akses Firestore ditolak. Periksa aturan keamanan Firebase.";
    }
    if (error?.code === "auth/popup-closed-by-user") return "Jendela login ditutup sebelum selesai.";
    if (error?.code === "auth/popup-blocked") return "Popup login diblokir browser. Izinkan popup lalu coba lagi.";
    return error?.message || "Terjadi kesalahan yang tidak diketahui.";
  }

  function applyRemoteState(data, uid) {
    // Snapshot hanya memperbarui tampilan dan cadangan lokal; tidak pernah menjadwalkan setDoc.
    applyingRemoteSnapshot = true;
    try {
      state = normalizeState(data);
      saveLocalState(uid);
      render();
      lastSnapshotJson = JSON.stringify(serializeState());
      setSyncStatus("Tersimpan ✓");
    } finally {
      applyingRemoteSnapshot = false;
    }
  }

  function listenToUserDocument(user, userDocument) {
    stopSnapshot = onSnapshot(
      userDocument,
      (snapshot) => {
        if (auth.currentUser?.uid !== user.uid) return;
        if (!snapshot.exists()) {
          cloudReady = true;
          updateAuthUi();
          setSyncStatus(cloudLoadFailed ? "Offline / gagal memuat" : "Tersimpan ✓", cloudLoadFailed);
          return;
        }

        try {
          cloudLoadFailed = false;
          const nextState = normalizeState(snapshot.data());
          const nextJson = JSON.stringify(serializeState(nextState));
          if (nextJson !== lastSnapshotJson) applyRemoteState(snapshot.data(), user.uid);
          else setSyncStatus("Tersimpan ✓");
          cloudReady = true;
          updateAuthUi();
        } catch (error) {
          console.error("Data Firestore Quest Log tidak valid:", error);
          setSyncStatus("Data cloud tidak valid", true);
          queueToast("Data Quest Log dari cloud tidak valid.", true);
        }
      },
      (error) => {
        cloudLoadFailed = true;
        console.error("Gagal menerima pembaruan Firestore Quest Log:", error);
        setSyncStatus("Gagal menyinkronkan", true);
        queueToast(`Sinkronisasi gagal: ${describeFirebaseError(error)}`, true);
      },
    );
  }

  async function writeCloudState(uid, snapshot = serializeState()) {
    setSyncStatus("Menyimpan...");
    const userDocument = doc(db, "users", uid);
    cloudWriteChain = cloudWriteChain
      .catch(() => {})
      .then(() => setDoc(userDocument, snapshot));
    try {
      await cloudWriteChain;
      if (currentUser?.uid === uid) {
        cloudLoadFailed = false;
        lastSnapshotJson = JSON.stringify(snapshot);
        setSyncStatus("Tersimpan ✓");
      }
    } catch (error) {
      console.error("Gagal menyimpan Quest Log ke Firestore:", error);
      if (currentUser?.uid === uid) setSyncStatus("Gagal menyimpan", true);
      queueToast(`Gagal menyimpan ke cloud: ${describeFirebaseError(error)}`, true);
    }
  }

  function scheduleCloudSave() {
    if (!currentUser || !cloudReady || applyingRemoteSnapshot) return;
    setSyncStatus("Menyimpan...");
    window.clearTimeout(pendingSave);
    const uid = currentUser.uid;
    pendingSave = window.setTimeout(() => {
      pendingSave = null;
      if (currentUser?.uid === uid && cloudReady) {
        void writeCloudState(uid, serializeState());
      }
    }, 500);
  }

  function persistState() {
    saveLocalState();
    scheduleCloudSave();
  }

  async function handleAuthState(user) {
    if (stopSnapshot) {
      stopSnapshot();
      stopSnapshot = null;
    }
    window.clearTimeout(pendingSave);
    pendingSave = null;
    cloudReady = false;
    cloudLoadFailed = false;
    currentUser = user;
    updateAuthUi();

    if (!user) {
      setSyncStatus("Belum masuk");
      return;
    }

    setSyncStatus("Memuat data...");
    const savedLocalState = state;
    const localOwner = loadLocalOwner();
    const localBelongsToUser = !localOwner || localOwner === user.uid;
    const initialState = localBelongsToUser ? savedLocalState : createDefaultState();
    state = initialState;
    render();
    const userDocument = doc(db, "users", user.uid);

    try {
      const snapshot = await getDoc(userDocument);
      if (auth.currentUser?.uid !== user.uid) return;

      if (snapshot.exists()) {
        state = normalizeState(snapshot.data());
      } else {
        state = initialState;
        // Dokumen baru dimulai dari cadangan lokal bila ada, agar migrasi tidak menghapus quest lama.
        await setDoc(userDocument, serializeState());
        if (auth.currentUser?.uid !== user.uid) return;
      }

      saveLocalState(user.uid);
      lastSnapshotJson = JSON.stringify(serializeState());
      listenToUserDocument(user, userDocument);
      cloudReady = true;
      updateAuthUi();
      render();
      setSyncStatus("Tersimpan ✓");
    } catch (error) {
      if (auth.currentUser?.uid !== user.uid) return;
      cloudLoadFailed = true;
      console.error("Gagal memuat Quest Log dari Firestore:", error);
      state = initialState;
      saveLocalState(user.uid);
      listenToUserDocument(user, userDocument);
      cloudReady = true;
      updateAuthUi();
      render();
      setSyncStatus("Offline / gagal memuat", true);
      queueToast(`Data cloud gagal dimuat: ${describeFirebaseError(error)}. Cadangan lokal tetap tersedia.`, true);
    }
  }

  elements.loginButton.addEventListener("click", async () => {
    elements.loginButton.disabled = true;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login Google Quest Log gagal:", error);
      queueToast(`Login gagal: ${describeFirebaseError(error)}`, true);
    } finally {
      elements.loginButton.disabled = false;
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    if (pendingSave && currentUser && cloudReady) {
      window.clearTimeout(pendingSave);
      pendingSave = null;
      await writeCloudState(currentUser.uid, serializeState());
    }
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Quest Log gagal:", error);
      queueToast(`Tidak dapat keluar: ${describeFirebaseError(error)}`, true);
    }
  });

  onAuthStateChanged(auth, (user) => {
    void handleAuthState(user).catch((error) => {
      console.error("Gagal memproses status autentikasi Quest Log:", error);
      setSyncStatus("Gagal memuat akun", true);
      queueToast(`Autentikasi gagal: ${describeFirebaseError(error)}`, true);
    });
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.name.value.trim();
    if (!name) {
      queueToast("Isi nama quest dulu ya", true);
      elements.name.focus();
      return;
    }

    state.quests.push({
      id: String(state.nid++),
      name: name.slice(0, 100),
      difficulty: elements.difficulty.value,
      deadline: elements.deadline.value || null,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    });
    persistState();
    elements.form.reset();
    elements.difficulty.value = "medium";
    render();
    elements.name.focus();
  });

  elements.filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeFilter = tab.dataset.filter;
      elements.filterTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      renderQuests();
    });
  });

  elements.questList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const quest = state.quests.find((item) => item.id === button.dataset.id);
    if (!quest) return;

    if (button.dataset.action === "delete") {
      state.quests = state.quests.filter((item) => item.id !== quest.id);
      persistState();
      render();
      return;
    }
    if (button.dataset.action !== "complete" || quest.completed) return;

    const previousLevel = getLevelInfo(state.totalXp).level;
    const today = getTodayKey();
    const xpEarned = DIFFICULTIES[quest.difficulty].xp;

    // XP disimpan sebagai total agar sisa XP tetap terbawa saat naik level.
    state.totalXp += xpEarned;
    quest.completed = true;
    quest.completedAt = Date.now();

    // Streak bertambah untuk hari berurutan; menyelesaikan beberapa quest di hari yang sama tidak menambahnya.
    if (state.lastCompletedDate !== today) {
      state.currentStreak = state.lastCompletedDate === getYesterdayKey() ? state.currentStreak + 1 : 1;
      state.lastCompletedDate = today;
      state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
    }

    const newLevel = getLevelInfo(state.totalXp).level;
    persistState();
    render();
    queueToast(`+${xpEarned} XP`);
    if (newLevel > previousLevel) queueToast("LEVEL UP!");
  });
  render();
})();
