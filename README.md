# HIS Local Print Service

Service ini berfungsi agar aplikasi HIS (berbasis web/Angular) dapat melakukan cetak (print) secara otomatis/silently ke printer tertentu yang dipilih oleh masing-masing kasir tanpa muncul popup print dari browser.

## Prasyarat
1. Install **Node.js** di PC/Laptop Kasir (https://nodejs.org).
2. Download folder local-print-service ini ke PC Kasir.

## Cara Install & Menjalankan
1. Buka folder ini di Terminal / Command Prompt (CMD).
2. Jalankan perintah installasi (cukup 1x saat pertama kali):
   `
   npm install
   `
3. Jalankan service:
   `
   npm start
   `
*(Biarkan jendela CMD ini tetap terbuka/berjalan di background saat kasir bekerja).*

## Cara Kerja (API)
Service ini berjalan secara lokal di http://localhost:5000.

- **Melihat daftar printer di PC ini:**
  GET http://localhost:5000/printers

- **Mencetak dokumen (Otomatis):**
  POST http://localhost:5000/print
  **Body (JSON):**
  `json
  {
      "printerName": "Nama Printer Kasir Epson",
      "url": "http://domain-his.com/api/cetak-laporan?id=123"
  }
  `
  *(Anda bisa mengirim "url" halaman yang ingin dicetak, atau mengirim raw "html").*

   Pengaturan tersebut hanya akan hilang dan butuh disetting ulang jika:

  1. Anda dengan sengaja melakukan Clear Browsing Data / Menghapus Cookies & Cache secara total di pengaturan browser.
  2. Anda login menggunakan laptop atau komputer fisik yang berbeda (karena pengaturan printer ini menempel spesifik pada setiap komputer/laptop kasir atau     
  apotek masing-masing).
  3. Anda berganti browser di laptop yang sama (misal sebelumnya setting di Google Chrome, tapi hari ini membuka aplikasinya dari Mozilla Firefox).

  Jadi, untuk pemakaian normal sehari-hari, Anda cukup melakukan setting ini satu kali saja!
