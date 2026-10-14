# ⚔️ Quest Log

To-do list bertema RPG. Ubah tugas harianmu jadi quest, selesaikan untuk mendapat XP, naik level, dan bangun streak setiap hari.

🔗 **Demo:** https://USERNAME.github.io/quest-log/

## ✨ Fitur

- **Karakter & level**: bar XP, gelar, dan avatar yang berubah seiring level naik
- **Tingkat kesulitan**: Mudah (+10 XP), Sedang (+25 XP), Sulit (+50 XP)
- **Streak harian**: naik kalau kamu menyelesaikan quest di hari yang berurutan
- **Badge**: 5 pencapaian yang bisa dibuka
- **Deadline**: quest yang lewat tanggal ditandai "Terlambat"
- **Filter**: Aktif, Selesai, dan Semua
- **Tersimpan otomatis** di browser (localStorage)
- Responsif di HP dan mendukung mode gelap/terang

## 🎮 Cara bermain

1. Tulis quest baru, pilih tingkat kesulitan, dan atur deadline kalau perlu.
2. Klik kotak centang saat quest selesai untuk mendapat XP.
3. Kumpulkan XP sampai naik level. Kebutuhan XP naik tiap level: `100 + (level - 1) × 50`.
4. Selesaikan minimal satu quest setiap hari untuk menjaga streak 🔥.

## 🛠️ Teknologi

HTML, CSS, dan JavaScript murni tanpa framework.

## 🚀 Menjalankan di komputer

```bash
git clone https://github.com/USERNAME/quest-log.git
cd quest-log
```

Lalu buka `index.html` di browser.

## 📌 Catatan

Data disimpan di localStorage, jadi tiap perangkat dan browser punya data sendiri.

## 📄 Lisensi

MIT
