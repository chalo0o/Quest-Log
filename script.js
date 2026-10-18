import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  runTransaction,
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
    { id: "penalty-free", icon: "🛡️", name: "Tanpa telat 7 hari", description: "7 hari berturut-turut tanpa denda", earned: (state) => state.penaltyFreeStreak >= 7 },
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
    hpText: document.querySelector("#hp-text"),
    hpProgress: document.querySelector("#hp-progress"),
    hpFill: document.querySelector("#hp-fill"),
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
  let penaltyCheckPromise = null;
  let penaltyCheckUserId = null;
  let localRevision = 0;
  let observedDate = getTodayKey();

  function createDefaultState() {
    return {
      quests: [],
      totalXp: 0,
      levelFloor: 1,
      hp: 100,
      lastCheck: getYesterdayKey(),
      penaltyFreeStreak: 0,
      lastDeadlineBonus: null,
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
    const levelFloor = Number.isSafeInteger(data.levelFloor) && data.levelFloor > 0
      ? data.levelFloor
      : getLevelInfo(Math.max(0, totalXp)).level;
    return {
      quests: quests.map((quest) => ({
        ...quest,
        penaltyDay: isDateKey(quest.penaltyDay) ? quest.penaltyDay : null,
      })),
      totalXp: Math.max(0, totalXp),
      levelFloor,
      hp: Math.min(100, Math.max(0, Number.isFinite(data.hp) ? data.hp : 100)),
      lastCheck: isDateKey(data.lastCheck) ? data.lastCheck : getYesterdayKey(),
      penaltyFreeStreak: Math.max(0, Number.isSafeInteger(data.penaltyFreeStreak) ? data.penaltyFreeStreak : 0),
      lastDeadlineBonus: isDateKey(data.lastDeadlineBonus) ? data.lastDeadlineBonus : null,
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
      level: getLevelInfo(sourceState.totalXp, sourceState.levelFloor).level,
      levelFloor: sourceState.levelFloor,
      hp: sourceState.hp,
      lastCheck: sourceState.lastCheck,
      penaltyFreeStreak: sourceState.penaltyFreeStreak,
      lastDeadlineBonus: sourceState.lastDeadlineBonus,
      done: completed.length,
      hard: completed.filter((quest) => quest.difficulty === "hard").length,
      streak: sourceState.currentStreak,
      best: sourceState.bestStreak,
      last: sourceState.lastCompletedDate,
      nid: sourceState.nid,
    };
  }

  function saveLocalState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
      return true;
    } catch (error) {
      queueToast("Data gagal disimpan. Periksa ruang penyimpanan browser.", true);
      console.error("Gagal menyimpan data Quest Log:", error);
      return false;
    }
  }

  function hasLocalProgress(sourceState) {
    return sourceState.quests.length > 0 ||
      sourceState.totalXp > 0 ||
      sourceState.hp < 100 ||
      sourceState.penaltyFreeStreak > 0 ||
      sourceState.lastDeadlineBonus !== null ||
      sourceState.currentStreak > 0 ||
      sourceState.bestStreak > 0 ||
      sourceState.lastCompletedDate !== null;
  }

  function mergeStates(cloudState, localState) {
    const quests = cloudState.quests.map((quest) => ({ ...quest }));
    const records = new Map(quests.map((quest, index) => [`${quest.id}:${quest.createdAt || 0}`, index]));
    const usedIds = new Set(quests.map((quest) => quest.id));
    let nextId = Math.max(cloudState.nid, localState.nid);
    const addedLocalQuests = [];

    for (const localQuest of localState.quests) {
      const key = `${localQuest.id}:${localQuest.createdAt || 0}`;
      const existingIndex = records.get(key);
      if (existingIndex !== undefined) {
        const existingQuest = quests[existingIndex];
        existingQuest.completed ||= localQuest.completed;
        if (localQuest.completedAt && (!existingQuest.completedAt || localQuest.completedAt < existingQuest.completedAt)) {
          existingQuest.completedAt = localQuest.completedAt;
        }
        if (localQuest.penaltyDay && (!existingQuest.penaltyDay || localQuest.penaltyDay > existingQuest.penaltyDay)) {
          existingQuest.penaltyDay = localQuest.penaltyDay;
        }
        continue;
      }

      const quest = { ...localQuest };
      if (usedIds.has(quest.id)) {
        while (usedIds.has(String(nextId))) nextId += 1;
        quest.id = String(nextId++);
      }
      usedIds.add(quest.id);
      records.set(`${quest.id}:${quest.createdAt || 0}`, quests.length);
      quests.push(quest);
      addedLocalQuests.push(quest);
    }

    const latestCompletion = [cloudState.lastCompletedDate, localState.lastCompletedDate]
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const currentStreak = cloudState.lastCompletedDate === localState.lastCompletedDate
      ? Math.max(cloudState.currentStreak, localState.currentStreak)
      : latestCompletion === localState.lastCompletedDate
        ? localState.currentStreak
        : cloudState.currentStreak;
    const localDeadlines = addedLocalQuests
      .filter((quest) => !quest.completed && quest.deadline)
      .map((quest) => addDaysToKey(quest.deadline, -1));
    const earliestLocalCheck = localDeadlines.sort()[0];
    const lastCheck = earliestLocalCheck && earliestLocalCheck < cloudState.lastCheck
      ? earliestLocalCheck
      : [cloudState.lastCheck, localState.lastCheck].sort().at(-1);

    return normalizeState({
      ...cloudState,
      quests,
      totalXp: Math.max(cloudState.totalXp, localState.totalXp),
      levelFloor: Math.max(cloudState.levelFloor, localState.levelFloor),
      hp: Math.max(cloudState.hp, localState.hp),
      lastCheck,
      penaltyFreeStreak: Math.max(cloudState.penaltyFreeStreak, localState.penaltyFreeStreak),
      lastDeadlineBonus: [cloudState.lastDeadlineBonus, localState.lastDeadlineBonus].filter(Boolean).sort().at(-1) || null,
      currentStreak,
      bestStreak: Math.max(cloudState.bestStreak, localState.bestStreak),
      lastCompletedDate: latestCompletion,
      nid: Math.max(nextId, cloudState.nid, localState.nid),
    });
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

  function getLevelInfo(totalXp, minimumLevel = 1) {
    let level = 1;
    let xpRemaining = totalXp;
    let xpNeeded = 100;
    while (xpRemaining >= xpNeeded) {
      xpRemaining -= xpNeeded;
      level += 1;
      xpNeeded = 100 + (level - 1) * 50;
    }
    if (minimumLevel > level) {
      level = minimumLevel;
      xpRemaining = Math.max(0, totalXp - getXpAtLevel(level));
      xpNeeded = 100 + (level - 1) * 50;
    }
    return { level, xp: xpRemaining, needed: xpNeeded };
  }

  function getXpAtLevel(level) {
    const previousLevels = level - 1;
    return 100 * previousLevels + 25 * previousLevels * (previousLevels - 1);
  }

  function isDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function dateKeyFromDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getTodayKey() {
    return dateKeyFromDate(new Date());
  }

  function getYesterdayKey() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return dateKeyFromDate(yesterday);
  }

  function addDaysToKey(dateKey, days) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return dateKeyFromDate(date);
  }

  function differenceInDays(fromKey, toKey) {
    const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
    const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
    return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000);
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
      level: getLevelInfo(state.totalXp, state.levelFloor).level,
    };
  }

  function renderCharacter(previousLevel) {
    const info = getLevelInfo(state.totalXp, state.levelFloor);
    const rank = RANKS[Math.min(Math.floor((info.level - 1) / 2), RANKS.length - 1)];
    elements.avatar.textContent = rank.avatar;
    elements.rank.textContent = rank.title;
    elements.level.textContent = String(info.level);
    elements.xpText.textContent = `${info.xp} / ${info.needed} XP`;
    elements.xpFill.style.width = `${(info.xp / info.needed) * 100}%`;
    elements.xpProgress.setAttribute("aria-valuenow", String(Math.round((info.xp / info.needed) * 100)));
    elements.xpProgress.setAttribute("aria-valuetext", `${info.xp} dari ${info.needed} XP`);
    elements.hpText.textContent = `${state.hp} / 100`;
    elements.hpFill.style.width = `${state.hp}%`;
    elements.hpProgress.setAttribute("aria-valuenow", String(state.hp));
    elements.hpProgress.setAttribute("aria-valuetext", `${state.hp} dari 100 HP`);
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

  function isOverdue(quest, today = getTodayKey()) {
    return Boolean(quest.deadline && !quest.completed && quest.deadline < today);
  }

  function getDeadlineStatus(quest, today = getTodayKey()) {
    if (!quest.deadline) return null;
    if (quest.deadline === today) return "Hari ini";
    if (quest.deadline === addDaysToKey(today, 1)) return "Besok";
    if (isOverdue(quest, today)) return `⚠️ Terlambat ${differenceInDays(quest.deadline, today)} hari`;
    return formatDate(quest.deadline);
  }

  function applyDailyPenalties(sourceState, today) {
    let day = addDaysToKey(sourceState.lastCheck, 1);
    let processedDays = 0;
    let totalPenalty = 0;
    const affectedQuestIds = new Set();

    // Hitung tiap hari yang terlewat, tetapi batasi kehilangan HP per pengecekan.
    while (day <= today) {
      let penaltyOccurred = sourceState.quests.some((quest) => quest.penaltyDay === day);
      for (const quest of sourceState.quests) {
        const completionDay = Number.isFinite(quest.completedAt)
          ? dateKeyFromDate(new Date(quest.completedAt))
          : null;
        if (
          (quest.completed && (!completionDay || completionDay <= day)) ||
          !quest.deadline ||
          quest.deadline >= day ||
          quest.penaltyDay >= day
        ) continue;
        quest.penaltyDay = day;
        totalPenalty += { easy: 5, medium: 10, hard: 20 }[quest.difficulty];
        affectedQuestIds.add(quest.id);
        penaltyOccurred = true;
      }

      sourceState.penaltyFreeStreak = penaltyOccurred ? 0 : sourceState.penaltyFreeStreak + 1;
      sourceState.lastCheck = day;
      processedDays += 1;
      day = addDaysToKey(day, 1);
    }

    const hpLost = Math.min(totalPenalty, 60, sourceState.hp);
    sourceState.hp -= hpLost;
    const fainted = hpLost > 0 && sourceState.hp === 0;
    if (fainted) {
      // Level floor tetap dipertahankan meski total XP berkurang.
      sourceState.totalXp = Math.floor(sourceState.totalXp * 0.75);
      sourceState.hp = 50;
    }

    return {
      processedDays,
      hpLost,
      affectedQuestCount: affectedQuestIds.size,
      fainted,
      changed: processedDays > 0 || hpLost > 0,
    };
  }

  function awardDailyDeadlineBonus(sourceState, today) {
    const dueToday = sourceState.quests.filter((quest) => quest.deadline === today);
    if (dueToday.length === 0 || dueToday.some((quest) => !quest.completed) || sourceState.lastDeadlineBonus === today) {
      return false;
    }
    sourceState.lastDeadlineBonus = today;
    sourceState.hp = Math.min(100, sourceState.hp + 5);
    return true;
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
      const deadlineStatus = getDeadlineStatus(quest);
      const metadata = [
        `<span class="difficulty-tag ${quest.difficulty}">${difficulty.label}</span>`,
        deadlineStatus ? `<span class="deadline-tag${overdue ? " overdue-tag" : ""}">${overdue ? "" : "📅 "}${deadlineStatus}</span>` : "",
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
    elements.form.hidden = false;
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
      saveLocalState();
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
    localRevision += 1;
    scheduleCloudSave();
  }

  function publishDailyCheck(result, uid) {
    state = result.state;
    saveLocalState();
    lastSnapshotJson = JSON.stringify(serializeState());
    render();

    if (result.penalty.hpLost > 0) {
      const dayNote = result.penalty.processedDays > 1 ? ` (${result.penalty.processedDays} hari)` : "";
      queueToast(`-${result.penalty.hpLost} HP: ${result.penalty.affectedQuestCount} quest terlambat${dayNote}`);
    }
    if (result.penalty.fainted) queueToast("Karaktermu pingsan! XP berkurang 25%");
    if (result.bonusAwarded) queueToast("+5 HP bonus harian");
  }

  async function checkDailyPenalties() {
    if (!currentUser || !cloudReady) return;
    const uid = currentUser.uid;
    if (penaltyCheckPromise) {
      if (penaltyCheckUserId === uid) return penaltyCheckPromise;
      await penaltyCheckPromise;
      if (currentUser?.uid !== uid || !cloudReady) return;
      return checkDailyPenalties();
    }

    const today = getTodayKey();
    const checkPromise = (async () => {
      if (!cloudLoadFailed) {
        try {
          const userDocument = doc(db, "users", uid);
          const result = await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(userDocument);
            const nextState = snapshot.exists() ? normalizeState(snapshot.data()) : createDefaultState();
            const penalty = applyDailyPenalties(nextState, today);
            const bonusAwarded = awardDailyDeadlineBonus(nextState, today);
            if (penalty.changed || bonusAwarded || !snapshot.exists()) {
              transaction.set(userDocument, serializeState(nextState));
            }
            return { state: nextState, penalty, bonusAwarded };
          });
          if (currentUser?.uid === uid) {
            publishDailyCheck(result, uid);
            setSyncStatus("Tersimpan ✓");
          }
          return;
        } catch (error) {
          console.error("Gagal menghitung penalti Quest Log di Firestore:", error);
          setSyncStatus("Gagal menghitung penalti", true);
          queueToast(`Pengecekan penalti cloud gagal: ${describeFirebaseError(error)}`, true);
        }
      }

      if (currentUser?.uid !== uid) return;
      const penalty = applyDailyPenalties(state, today);
      const bonusAwarded = awardDailyDeadlineBonus(state, today);
      publishDailyCheck({ state, penalty, bonusAwarded }, uid);
      persistState();
    })().finally(() => {
      if (penaltyCheckUserId === uid) {
        penaltyCheckPromise = null;
        penaltyCheckUserId = null;
      }
      if (currentUser?.uid === uid && cloudReady && getTodayKey() !== today) {
        void checkDailyPenalties();
      }
    });
    penaltyCheckUserId = uid;
    penaltyCheckPromise = checkPromise;
    return checkPromise;
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
    const initialState = normalizeState(state);
    state = initialState;
    render();
    const userDocument = doc(db, "users", user.uid);

    try {
      let mergeResult;
      do {
        mergeResult = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(userDocument);
          const localState = normalizeState(state);
          const revision = localRevision;
          const cloudState = snapshot.exists() ? normalizeState(snapshot.data()) : createDefaultState();
          const mergedState = hasLocalProgress(localState) || !snapshot.exists()
            ? mergeStates(cloudState, localState)
            : cloudState;
          const mergedData = serializeState(mergedState);
          if (!snapshot.exists() || JSON.stringify(serializeState(cloudState)) !== JSON.stringify(mergedData)) {
            transaction.set(userDocument, mergedData);
          }
          return { state: mergedState, revision };
        });
        if (auth.currentUser?.uid !== user.uid) return;
        if (localRevision === mergeResult.revision) break;
      } while (true);

      state = mergeResult.state;

      saveLocalState();
      lastSnapshotJson = JSON.stringify(serializeState());
      listenToUserDocument(user, userDocument);
      cloudReady = true;
      updateAuthUi();
      render();
      setSyncStatus("Tersimpan ✓");
      await checkDailyPenalties();
    } catch (error) {
      if (auth.currentUser?.uid !== user.uid) return;
      cloudLoadFailed = true;
      console.error("Gagal memuat Quest Log dari Firestore:", error);
      state = normalizeState(state);
      saveLocalState();
      listenToUserDocument(user, userDocument);
      cloudReady = true;
      updateAuthUi();
      render();
      setSyncStatus("Offline / gagal memuat", true);
      queueToast(`Data cloud gagal dimuat: ${describeFirebaseError(error)}. Cadangan lokal tetap tersedia.`, true);
      await checkDailyPenalties();
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
    if (penaltyCheckPromise) {
      queueToast("Pengecekan penalti sedang berlangsung. Coba lagi sebentar.");
      return;
    }
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
      penaltyDay: null,
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
    if (penaltyCheckPromise) {
      queueToast("Pengecekan penalti sedang berlangsung. Coba lagi sebentar.");
      return;
    }
    const quest = state.quests.find((item) => item.id === button.dataset.id);
    if (!quest) return;

    if (button.dataset.action === "delete") {
      state.quests = state.quests.filter((item) => item.id !== quest.id);
      persistState();
      render();
      return;
    }
    if (button.dataset.action !== "complete" || quest.completed) return;

    const previousLevel = getLevelInfo(state.totalXp, state.levelFloor).level;
    const today = getTodayKey();
    const baseXp = DIFFICULTIES[quest.difficulty].xp;
    const xpMultiplier = quest.deadline && today < quest.deadline ? 1.2 : quest.deadline && today > quest.deadline ? 0.5 : 1;
    const xpEarned = Math.round(baseXp * xpMultiplier);
    const hpBeforeRecovery = state.hp;

    // XP disimpan sebagai total agar sisa XP tetap terbawa saat naik level.
    state.totalXp += xpEarned;
    state.levelFloor = Math.max(state.levelFloor, getLevelInfo(state.totalXp).level);
    state.hp = Math.min(100, state.hp + 10);
    quest.completed = true;
    quest.completedAt = Date.now();
    const hpRecovered = state.hp - hpBeforeRecovery;

    // Streak bertambah untuk hari berurutan; menyelesaikan beberapa quest di hari yang sama tidak menambahnya.
    if (state.lastCompletedDate !== today) {
      state.currentStreak = state.lastCompletedDate === getYesterdayKey() ? state.currentStreak + 1 : 1;
      state.lastCompletedDate = today;
      state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
    }

    const bonusAwarded = awardDailyDeadlineBonus(state, today);
    const newLevel = getLevelInfo(state.totalXp, state.levelFloor).level;
    persistState();
    render();
    const xpNote = xpMultiplier > 1
      ? " (bonus lebih awal)"
      : xpMultiplier < 1
        ? " (terlambat, dipotong 50%)"
        : "";
    queueToast(`+${xpEarned} XP${xpNote}${hpRecovered ? `, +${hpRecovered} HP` : ""}`);
    if (bonusAwarded) queueToast("+5 HP bonus harian");
    if (newLevel > previousLevel) queueToast("LEVEL UP!");
  });

  window.setInterval(() => {
    const today = getTodayKey();
    if (today === observedDate) return;
    observedDate = today;
    render();
    void checkDailyPenalties();
  }, 30000);

  render();
})();
