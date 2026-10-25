# Lens Capture

Telefonda gördüğün İngilizce kelime, kalıp ya da cümleyi **Paylaş → Lens** ile tek dokunuşta yakala. Gemini Türkçe anlamı, bağlam çevirisini, örnek cümleleri hazırlar; aralıklı tekrarla öğrenirsin.

Build adımı yok: düz HTML + JS. Dosyaları herhangi bir HTTPS sunucusuna koyman yeterli.

## 1. Yayına al (GitHub Pages, ~3 dk, ücretsiz)

Paylaş menüsü ve kurulum için site **HTTPS** üzerinden açılmalı.

1. GitHub'da yeni bir repo aç, örn. `lens` (Public).
2. Bu klasördeki dosyaları olduğu gibi yükle (`index.html` repo kökünde olmalı).
   - Terminalden: `git init && git add . && git commit -m "Lens Capture" && git branch -M main && git remote add origin git@github.com:<kullanici>/lens.git && git push -u origin main`
3. Repo → **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save.
4. 1-2 dakika sonra adres hazır: `https://<kullanici>.github.io/lens/`

## 2. Telefona kur (Xiaomi 14)

1. Adresi **Chrome**'da aç (Mi Browser'da paylaş menüsü güvenilir çalışmaz).
2. ⋮ menü → **Uygulamayı yükle** / **Ana ekrana ekle**.
3. Uygulamayı aç → **Ayarlar** → Gemini API anahtarını yapıştır → **Anahtarı test et**.
   Anahtar: https://aistudio.google.com → Get API key. Sadece bu telefonda saklanır.
4. HyperOS kapatmasın diye: Ayarlar → Uygulamalar → Chrome → Pil tasarrufu → **Kısıtlama yok**.

## 3. Kullanım

- **Yakala:** X'te / tarayıcıda metni seç (ya da tweet'in Paylaş düğmesi) → Paylaş → **Lens**.
  - Öğrenmek istediğin kelimelere dokun. Kalıp için ilk ve son kelimeye dokunman yeter, aradakiler otomatik dahil olur.
  - Hiçbir şey seçmezsen metnin tamamı cümle kartı olur (çeviri + öne çıkan kalıplar).
  - **Kaydet** → uygulama kendini kapatır, kaldığın yere dönersin.
- **X'te:** tweet altındaki paylaş ikonu → **Şununla paylaş** → **Lens**. X sadece link gönderir, Lens tweet metnini kendisi çeker.
- **Kopyala yeter:** metni kopyalayıp Lens'i açınca üstte "Panoda yeni metin → Ekle" çıkar (ilk seferde "Panodan yapıştır"a basıp izin ver).
- **Paylaş çıkmıyorsa:** metni kopyala → ana ekranda Lens ikonuna uzun bas → **Panodan ekle**.
- **Tekrar:** Bilmedim / Zor / İyi / Kolay. Bildiğin kartların aralığı uzar (1 → 3 → 8 → 20+ gün). Birkaç tekrardan sonra kartlar bazen "boşluk doldur" moduyla gelir.
- Aynı şeyi tekrar yakalarsan kopya açılmaz, kart tekrara öne alınır.
- Offline'da da açılır ve tekrar yapılır; offline yakalananlar internet gelince karta dönüşür.
- **Ayarlar → Dışa aktar** ile ara ara JSON yedek al.

## Okuma (web sayfaları)

- Chrome'da bir haberi aç → ⋮ → **Paylaş** → **Lens**. Sayfa sade okuyucuda açılır ve **Oku** sekmesine kaydedilir (offline da okunur).
- Kelimeye dokun → alt panelde anlam, telaffuz, cümle çevirisi. **↔ Kalıp seç** → son kelimeye dokun ("shut down" gibi).
- **¶ Çevir** paragrafın Türkçesini altına ekler, **¶ Dinle** / 🎧 sesli okur.
- **Aa**: yazı boyutu, serif/sans, tema (oto/açık/sepya/koyu), Oxford vurgu seviyesi.
- Altı çizili = Oxford 3000/5000 listesinde (seçtiğin seviye ve üstü), noktalı = kartlarında var.
- Sayfa metni Jina Reader (r.jina.ai) ile, olmazsa allorigins + Mozilla Readability ile çekilir; bu servislere sadece sayfanın linki gider.
- Sayfada metni **seçip** paylaşırsan okuyucu yerine doğrudan Ekle ekranına gelir.

## Dosyalar

| Dosya | Görev |
|---|---|
| `manifest.webmanifest` | Kurulum + `share_target` (Android paylaş menüsü) + kısayollar |
| `sw.js` | Offline önbellek |
| `app.js` | Yakalama, Gemini, IndexedDB, aralıklı tekrar |
| `reader.js` | Okuyucu, kütüphane, Oxford vurgusu |
| `readability.js` | Mozilla Readability 0.6.0 (Apache 2.0) |
| `oxford.json` | Resmi Oxford 3000/5000 CEFR listeleri (kelime → seviye) |
| `index.html`, `styles.css` | Arayüz |
| `icon-*.png`, `maskable-512.png` | Uygulama ikonları |

Güncelleme yaptığında `sw.js` içindeki `VERSION` değerini artır (`lens-v2`), telefona yeni sürüm gelsin.

## Oxford listesi kaynağı

`oxford.json`, Oxford Learner's Dictionaries'in resmi PDF'lerinden üretildi:
*The Oxford 3000 by CEFR level* ve *The Oxford 5000 by CEFR level* (© Oxford University Press).
4.953 kelime: A1 900 · A2 793 · B1 690 · B2 1.296 · C1 1.274. Birden çok seviyede geçen kelimede en düşüğü alındı.
