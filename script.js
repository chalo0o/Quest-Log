(() => {
  "use strict";

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
  };

  let activeFilter = "active";
  let toastQueue = [];
  let toastShowing = false;
  let state = loadState();

  function createDefaultState() {
    return {
      quests: [],
      totalXp: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastCompletedDate: null,
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return createDefaultState();

      const parsed = JSON.parse(saved);
      if (
        !parsed ||
        !Array.isArray(parsed.quests) ||
        !Number.isFinite(parsed.totalXp) ||
        !Number.isFinite(parsed.currentStreak) ||
        !Number.isFinite(parsed.bestStreak)
      ) {
        throw new Error("Data penyimpanan Quest Log tidak valid.");
      }
      return {
        quests: parsed.quests.filter(isValidQuest),
        totalXp: Math.max(0, parsed.totalXp),
        currentStreak: Math.max(0, parsed.currentStreak),
        bestStreak: Math.max(0, parsed.bestStreak),
        lastCompletedDate: typeof parsed.lastCompletedDate === "string" ? parsed.lastCompletedDate : null,
      };
    } catch (error) {
      queueToast("Data tersimpan tidak dapat dibaca", true);
      console.error("Gagal membaca data Quest Log:", error);
      return createDefaultState();
    }
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

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      queueToast("Data gagal disimpan. Periksa ruang penyimpanan browser.", true);
      console.error("Gagal menyimpan data Quest Log:", error);
      return false;
    }
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

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.name.value.trim();
    if (!name) {
      queueToast("Isi nama quest dulu ya", true);
      elements.name.focus();
      return;
    }

    state.quests.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: name.slice(0, 100),
      difficulty: elements.difficulty.value,
      deadline: elements.deadline.value || null,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    });
    saveState();
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
      saveState();
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
    saveState();
    render();
    queueToast(`+${xpEarned} XP`);
    if (newLevel > previousLevel) queueToast("LEVEL UP!");
  });

  render();
})();
