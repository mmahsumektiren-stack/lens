package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Paylaş menüsündeki tek "Lens" girişi. Gelen şeye göre yönlendirir:
 *  - sadece bir sayfa bağlantısı  → FetchActivity (sayfa telefonda açılır, yazı Lens'e verilir)
 *  - Reddit bağlantısı            → ResolveActivity (gönderi + yorumlar)
 *  - X/Twitter bağlantısı ya da seçili metin → olduğu gibi Lens'e
 */
public class ShareActivity extends Activity {
    private static final Pattern URL = Pattern.compile("https?://\\S+", Pattern.CASE_INSENSITIVE);
    private static final Pattern REDDIT = Pattern.compile("^https?://(?:[a-z0-9-]+\\.)?(?:reddit\\.com|redd\\.it)/", Pattern.CASE_INSENSITIVE);
    private static final Pattern X = Pattern.compile("^https?://(?:[a-z0-9-]+\\.)?(?:x\\.com|twitter\\.com|t\\.co)/", Pattern.CASE_INSENSITIVE);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        String text = in != null ? in.getStringExtra(Intent.EXTRA_TEXT) : null;
        String subject = in != null ? in.getStringExtra(Intent.EXTRA_SUBJECT) : null;
        if (text == null) text = "";
        text = text.trim();

        Matcher m = URL.matcher(text);
        String link = m.find() ? m.group().replaceAll("[)\\].,;!?\"'”’]+$", "") : null;
        // bağlantı dışında kayda değer metin var mı? (ör. seçilip paylaşılan bir cümle)
        String rest = link != null ? text.replace(m.group(), "").trim() : text;
        if (subject != null && rest.equals(subject.trim())) rest = ""; // bazı uygulamalar başlığı metne de koyar
        // Sitenin kendi "Paylaş" düğmesi bağlantıya başlığı ya da ilk cümleyi ekler: kısa metin + düz bağlantı = sayfa paylaşımı.
        // Seçilip paylaşılan metin ya bağlantısızdır ya da Chrome'un #:~:text= bağlantısını taşır; 60+ kelime = "Tümünü seç".
        int restWords = rest.isEmpty() ? 0 : rest.split("\\s+").length;
        boolean pageShare = link != null && !link.contains("#:~:text=") && restWords < 60;

        if (pageShare && REDDIT.matcher(link).find()) {
            start(ResolveActivity.class, "lensresolve://open?u=" + Uri.encode(link));
        } else if (pageShare && !X.matcher(link).find()) {
            Intent f = new Intent(this, FetchActivity.class);
            f.setData(Uri.parse("lensfetch://open?u=" + Uri.encode(link)));
            String hint = subject != null && !subject.isEmpty() ? subject : rest.length() > 160 ? rest.substring(0, 160) : rest;
            if (!hint.isEmpty()) f.putExtra(Intent.EXTRA_SUBJECT, hint);
            startActivity(f);
        } else {
            // Lens'in kendi paylaşım biçimi: ?text=&title=&url=
            Uri.Builder b = Uri.parse(LensLauncher.BASE).buildUpon();
            String t = text.length() > LensLauncher.MAX_TEXT ? text.substring(0, LensLauncher.MAX_TEXT) : text;
            b.appendQueryParameter("text", t);
            if (subject != null && !subject.isEmpty()) b.appendQueryParameter("title", subject);
            LensLauncher.open(this, b.build());
        }
        finish();
    }

    private void start(Class<?> cls, String data) {
        Intent i = new Intent(this, cls);
        i.setData(Uri.parse(data));
        startActivity(i);
    }
}
