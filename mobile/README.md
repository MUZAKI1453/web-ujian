# Aplikasi Android CBT

Pembungkus Android (Capacitor 8) untuk situs CBT. Aplikasi tidak membawa salinan web: setiap varian memuat situs sekolahnya, jadi pembaruan web langsung sampai ke pengguna tanpa rilis APK baru. APK baru hanya perlu saat kode di folder ini berubah.

| Varian | ID aplikasi | Situs |
|---|---|---|
| `smp` | `id.sch.baitussalam.cbt.smp` | https://cbt.smpipbaitussalam.sch.id |
| `sma` | `id.sch.baitussalam.cbt.sma` | https://cbt.smaipbaitussalam.sch.id |

Alamat dan nama aplikasi tiap varian diatur di `android/app/build.gradle` (`productFlavors`).

## Membangun

Kebutuhan: Node.js, JDK 25, Android SDK 37 (Gradle 9.6 dan AGP 9.4.1 diunduh otomatis).

```bash
cd mobile
npm install
npx cap sync android
npm run apk:debug
```

Hasil: `android/app/build/outputs/apk/<varian>/debug/`. Proyek `mobile/android` bisa dibuka langsung di Android Studio.

`npx cap sync android` wajib dijalankan sekali setelah `npm install` (membuat modul `capacitor-cordova-android-plugins` yang tidak disimpan di git).

## APK rilis

APK debug tidak untuk dibagikan ke siswa. Untuk rilis, buat keystore sekali dan simpan baik-baik; kehilangan keystore berarti aplikasi tidak bisa diperbarui.

```bash
keytool -genkeypair -v -keystore android/cbt-release.jks -alias cbt -keyalg RSA -keysize 2048 -validity 10000
```

Lalu buat `android/keystore.properties` (tidak masuk git):

```properties
storeFile=cbt-release.jks
storePassword=...
keyAlias=cbt
keyPassword=...
```

```bash
npm run apk:release
```

Naikkan `versionCode` dan `versionName` di `android/app/build.gradle` pada setiap rilis.

## Bagian native

Kode Kotlin ada di `android/app/src/main/java/id/sch/baitussalam/cbt/`.

- `MainActivity.kt`: memuat situs sekolah, meneruskan tombol back ke history halaman, dan mengirim kejadian `cbtnativesplit` ke halaman saat masuk mode multi-jendela.
- `CbtNativePlugin.kt`: plugin `CbtNative`, dipanggil web lewat `frontend/src/services/nativeApp.ts`.
  - `enableExamMode({ pin })` / `disableExamMode()`: blokir screenshot dan rekam layar, layar tetap menyala, bilah sistem disembunyikan. `pin: true` meminta Android menyematkan aplikasi; Android menampilkan dialog konfirmasi dulu, sehingga web saat ini memanggilnya dengan `pin: false`.
  - `saveFile({ name, mime, data })`: menyimpan unduhan (template, rekap nilai) ke folder Download.
  - `status()`: keadaan mode ujian.

Ikon tiap sekolah ada di `android/app/src/<varian>/res/`, dibuat dari `frontend/public/icons/`.

## Batas pengamanan

Mode ujian mempersulit keluar dari ujian dan mengambil gambar layar, tetapi bukan kunci perangkat. Keluar aplikasi tetap bisa dan dicatat web sebagai pelanggaran. HP kedua tidak terdeteksi. Siswa iPhone memakai versi web.
