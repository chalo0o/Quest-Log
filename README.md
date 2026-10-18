# ⚔️ Quest Log

To-do list bertema RPG. Ubah tugas harianmu jadi quest, selesaikan untuk mendapat XP, naik level, jaga HP karaktermu, dan bangun streak setiap hari. Datanya tersinkron antara laptop dan HP.

🔗 **Demo:** https://chalo0o.github.io/Quest-Log/

## ✨ Fitur

### Sistem game
- **Karakter & level**: bar XP, gelar, dan avatar yang berubah seiring level naik
- **Tingkat kesulitan**: Mudah (+10 XP), Sedang (+25 XP), Sulit (+50 XP)
- **Streak harian**: naik kalau kamu menyelesaikan quest di hari yang berurutan
- **Badge**: pencapaian yang bisa dibuka, termasuk "Tanpa telat 7 hari" dan "10 sesi fokus"

### HP & deadline
- **HP karakter** (maksimal 100) berkurang kalau quest lewat deadline: Mudah -5, Sedang -10, Sulit -20 per hari
- **Bonus tepat waktu**: selesai sebelum hari deadline dapat +20% XP
- **Selesai terlambat**: XP dipotong 50%
- **Pemulihan HP**: +10 HP tiap quest selesai, dan +5 HP kalau semua quest hari itu beres
- **Pingsan**: kalau HP habis, XP berkurang 25% dan HP dipulihkan ke 50
- Label status di tiap quest: Hari ini, Besok, atau Terlambat X hari

### Organisasi quest
- **Kategori** Kuliah, Kerja, dan Pribadi, masing-masing dengan warna sendiri
- **Filter** berdasarkan kategori, dan tab Aktif / Selesai / Semua
- **Konfirmasi hapus** dengan tombol "Urungkan" untuk membatalkan penghapusan

### Fokus & statistik
- **Timer Pomodoro** per quest: 25 menit fokus, 5 menit istirahat, dengan bonus +10 XP tiap sesi fokus selesai (maksimal 8 sesi per hari)
- **Statistik mingguan**: grafik quest selesai dan XP selama 7 hari terakhir, lengkap dengan ringkasan total

### Sinkronisasi
- **Login Google** lewat Firebase Authentication
- **Data tersimpan di Firestore**, jadi quest yang dibuat di laptop langsung muncul di HP
- Cadangan di localStorage kalau sedang offline
- Responsif di HP, mendukung mode gelap dan terang

## 🎮 Cara bermain

1. Login dengan akun Google.
2. Tulis quest baru, pilih kesulitan dan kategori, lalu atur deadline kalau perlu.
3. Klik 🍅 untuk memulai sesi fokus, atau langsung centang kalau quest sudah selesai.
4. Kumpulkan XP sampai naik level. Kebutuhan XP naik tiap level: `100 + (level - 1) × 50`.
5. Selesaikan quest sebelum deadline supaya HP tetap aman, dan jaga streak 🔥 setiap hari.

## 🛠️ Teknologi

- HTML, CSS, dan JavaScript murni (tanpa framework)
- Firebase Authentication dan Cloud Firestore
- GitHub Pages untuk hosting

## 🚀 Menjalankan di komputer

```bash
git clone https://github.com/chalo0o/Quest-Log.git
cd Quest-Log
```

Karena memakai login Google, web tidak bisa dibuka langsung lewat `file:///`. Jalankan lewat server lokal, misalnya ekstensi **Live Server** di VS Code (klik **Go Live**).

Kalau mau memakai Firebase milikmu sendiri:

1. Buat project di [Firebase Console](https://console.firebase.google.com), lalu daftarkan sebuah Web App.
2. Aktifkan **Authentication → Google** dan buat database **Firestore**.
3. Ganti `firebaseConfig` di `script.js` dengan config project-mu.
4. Tambahkan `localhost` dan domain hosting-mu ke **Authentication → Settings → Authorized domains**.
5. Pasang rules Firestore berikut agar setiap user hanya bisa mengakses datanya sendiri:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 📌 Catatan

- Data tiap akun disimpan di dokumen `users/{uid}` pada Firestore.
- Timer Pomodoro yang sedang berjalan hanya disimpan di perangkat yang dipakai, tidak ikut disinkronkan.
- Notifikasi dan bunyi saat timer selesai bisa tidak muncul di HP kalau layar terkunci. Itu batasan browser mobile.
