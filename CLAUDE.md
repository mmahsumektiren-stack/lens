# Lens — proje notu (Claude için)

MME'nin telefonunda (Xiaomi 14, HyperOS, Chrome) kullandığı İngilizce öğrenme PWA'sı. X/Chrome/Reddit'te gördüğü kelime ve
kalıpları yakalar, Gemini ile Türkçe kart yapar, web yazılarını sade okuyucuda okutur. Yanında küçük bir Android yardımcı
uygulaması var: **Lens Seçim** (paylaş menüsü, sayfa getirme).

- Canlı: https://mmahsumektiren-stack.github.io/lens/ (GitHub Pages, `main` dalının kökü)
- Test kopyası: …/lens/dev/ (`dev` dalı, workflow `main/dev/` klasörüne yazar)

## Çalışma kuralları (MME'nin istekleri — uy)

- **Dil:** Türkçe konuş. Kısa, pratik cevap; adım adım anlatma, sonucu söyle.
- **Yükleme:** Varsayılan, değişikliği **doğrudan canlıya** almak: `dev`'de commit → `dev` push → `main`'e `--no-ff` merge → `main` push →
  `dev`'i `origin/main` ile hizala ve push. "teste yükle" derse yalnız `dev`'e push (Lens Test'e gider).
- **"Önce göster / onaylayınca yükle" derse:** değişikliği yap, test et, Playwright ekran görüntüsünü gönder, **push etme**
  (dev'e de etme — dev de Lens Test'i günceller). "Yükle/ok" deyince canlıya al.
- Her yayından önce: `python3 tools/bump.py` (sürüm numarası; yoksa telefon eski dosyaları kullanır) ve `python3 tests/run_all.py`.
- Yayından sonra Pages derlemesini doğrula: `gh api repos/mmahsumektiren-stack/lens/commits/<sha>/check-runs` → `deploy: success`.
  Bir derleme "cancelled" görünürse genelde sonraki commit (dev-preview) onu geçmiştir; en son `main` commit'ine bak.
- Kullanıcıya her yayından sonra: "Lens'i iki kez kapatıp aç" (service worker güncellemesi). Yalnız Android tarafı değiştiyse yeni APK gerekir.
- **APK imza şifresini (`KS_PASS`) asla yazma/tekrarlama.** Repo secret'ında duruyor.
- Commit/PR mesajları Türkçe; sonda Claude atıf satırları.

## Kesin ürün kararları

- **Oxford 3000/5000:** Kaynak yalnız resmi Oxford PDF'leri (`tools/3000r.txt`, `tools/5000r.txt` → `tools/oxford_parse.py` → `oxford.json`).
  Text Checker'ın kullandığı eski site listesine **geçme** (MME istemedi; PDF daha yeni: brake, AI, podcast… var).
  Gösterilen bilgi kaynağa **birebir sadık**: tür listedeki gibi İngilizce ("adj., n."), seviye listedeki satırdan; tahmin/AI yok.
  Eşleştirme: kelimenin kendisi başlıksa ya da başlığın kelime türüne uygun **dilbilgisel çekimi**yse (structures→structure,
  bigger→big, children→child). Türetmeler (-ly, -ness, "yapan" -er) asla köke indirilmez (stably≠stab, killer≠kill).
- **Kartlar ekranı:** kapalı kartta Türkçe anlam yok; yalnız Oxford rozeti + seviye + tür (listede yoksa hiçbir şey).
  Açınca önce özgün metin (tweet/cümle); anlam ve geri kalan içerik yazısız ok düğmesiyle açılır, kart kapanınca yine gizlenir.
  Kartta tekrar zamanıyla ilgili bilgi gösterme. Satırda: eklenme tarihi + çöp kutusu (onaylı silme). "Sözlük" düğmesi var.
- **Kalıplar (Gemini):** yalnız **phrasal verb** ve **deyim**. Collocation, kibar kalıp ("thank you for your patience"),
  şeffaf öbek ("security issue") listelenmez. Talimat değişirse `PH_V`'yi artır (eski sonuçlar yenilenir).
- Uygulama **Oku** ekranında (Kütüphanem sekmesi) açılır. Tweet'ler Kütüphanem'e kaydedilir. Sitenin "Paylaş"ı ve tweet linki okuyucuda açılır.

## Ertelenenler ("sonra konuşalım" — kendiliğinden başlama)

Tekrar ekranı + ilerleme görünümü (cevap uzunsa not düğmeleri ekran altında kalıyor) · otomatik yedek (Drive/dosya) ·
ev Wi-Fi'ında *.workers.dev engeli · ücretli Gemini anahtarı · Oku'daki link kutusunu "+ Link" düğmesine çevirmek ·
Keşfet akışını saatlik yapmak · pano/seçim kartlarına kaynak bağlantısı.

## Mimari

Build yok: düz HTML/CSS/JS. Script sırası `index.html`'de: icons.js, readability.js, page-extract.js, reader.js, sources.js,
reader-extras.js, discover.js, app.js (hepsi global fonksiyonlar; aynı adla iki `const` tanımlama → sayfa çöker, test bunu yakalar).

| Dosya | Görev |
|---|---|
| `app.js` | Durum, depolama (`store` localStorage `lens.`/`lensdev.`), IndexedDB `DB` (`cards`, `articles`), Ekle, Kartlar, Tekrar (SRS), Ayarlar, Gemini (`geminiJSON`, model sırası + kota bloğu, temel kart yedeği), paylaşım girişi `handleLaunchParams`, servis günlüğü `logSvc` |
| `reader.js` | Oxford (`loadOxford`, `oxLookup`, `lemmaCandidates`, rozetler), yazı içe aktarma (Jina/Readability/telefon/Reddit), kütüphane, okuyucu, kelime paneli |
| `reader-extras.js` | Sözlükler, sürükleyerek kalıp seçme, yazı sonu özeti, zorluk etiketi, "başka yerlerde gördün" (sightings), Gemini kalıp bulma, panelde "gördüğün yerler" |
| `sources.js` | Engel sayfası tespiti, Reddit yardımcıları, Lens Seçim intent bağlantıları |
| `discover.js` | Keşfet akışı (`feed` dalındaki `feed.json`, `tools/feeds.py` 3 saatte bir) |
| `page-extract.js` | Readability → blok listesi (PWA ve Android FetchActivity ortak) |
| `sw.js` | Önbellek; `/dev/` ile ayrı önek |
| `oxford.json` | `{h: başlık→seviye, f: çekim→başlık, x: yalnız-5000 başlıklar, e: başlık→"liste\|seviye\|tür;…"}` |
| `android/` | Lens Seçim (Gradle yok: aapt2/javac/d8, `build.sh`; `LENS_DEV=1` test paketi). Workflow `android.yml` → release `secim` / `secim-test` |

Android → PWA veri aktarımı URL parçasıyla: `#page=<json>`, `#reddit=<json>`, `#perr=<mesaj>`.
Tarayıcıdan Reddit/çoğu site CORS/bot engeline takılır; bu yüzden Android tarafı (ResolveActivity, FetchActivity) getirir.

## Test

`python3 tests/run_all.py` (ya da `python3 tests/run_all.py read ph`). Playwright + yerel `http.server`; Gemini, Jina, fxtwitter
vb. `route` ile taklit edilir, internet gerekmez. Ekran görüntüleri ve günlükler `tests/out/` (git dışı).
Gemini taklitleri isteği talimat metnine göre ayırır (kalıp isteği: `'ONLY these two kinds'`); `phrasePrompt` metnini değiştirirsen testlerdeki bu anahtarı da güncelle.
Yeni özellikte yeni bir `tests/test_<ad>.py` ekle (mevcutları örnek al: kendi portu, `ROOT`/`OUT`/`FIX` sabitleri, sonda `print('errs', errs)`).
Ortam notu: `pkill -f` ile kendi komut satırında geçen bir deseni öldürme (komutun kendisini de öldürür).
