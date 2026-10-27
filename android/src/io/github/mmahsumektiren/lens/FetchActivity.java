package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * "Telefonla aç": sayfayı görünmez bir tarayıcıda (Chrome motoru, senin bağlantın) açar,
 * bot doğrulaması varsa bitmesini bekler, yazıyı Readability ile çıkarır ve Lens'e verir.
 * Uzak sunucuları engelleyen sitelerde (Reuters vb.) işe yarar. Olmazsa Lens kendi yollarını dener.
 */
public class FetchActivity extends Activity {
    private static final long FIRST_CHECK_MS = 1200, CHECK_EVERY_MS = 1500, GIVE_UP_MS = 30000;
    private static final int MAX_JSON = 150000; // Android'in uygulamalar arası veri sınırının (~1 MB) epey altında kal; çok uzun yazılar kırpılır

    // bot doğrulaması sürüyor mu / sayfa yeterince yüklendi mi
    private static final String CHECK_JS = "(function(){var t=document.title||'';"
            + "var x=(document.body&&document.body.innerText)||'';"
            + "var ch=/just a moment|attention required|verify (that )?you are (a )?human|checking (your browser|if the site)|security check|bir dakika|doğrulanıyor/i.test(t+' '+x.slice(0,600));"
            + "return JSON.stringify({ch:ch,len:x.length,ready:document.readyState});})()";

    private final Handler h = new Handler(Looper.getMainLooper());
    private WebView web;
    private String url, title;
    private long startedAt;
    private boolean done, extracting;
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent() != null ? getIntent().getData() : null;
        url = data != null ? data.getQueryParameter("u") : null;
        title = getIntent() != null ? getIntent().getStringExtra(android.content.Intent.EXTRA_SUBJECT) : null;
        if (url == null || !url.startsWith("http")) { finish(); return; }
        buildUi();

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setBlockNetworkImage(true); // resimlere gerek yok, hız
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        // "wv" işareti bazı sitelerde gömülü tarayıcı engeline takılır: normal Chrome gibi görün
        ws.setUserAgentString(ws.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+\\.\\d+ ", ""));
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String u) {
                schedule(FIRST_CHECK_MS);
            }
        });
        startedAt = System.currentTimeMillis();
        web.loadUrl(url);
        h.postDelayed(new Runnable() {
            @Override
            public void run() { giveUp("sayfa 30 sn'de açılmadı"); }
        }, GIVE_UP_MS);
    }

    private void buildUi() {
        float d = getResources().getDisplayMetrics().density;
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0x66000000);

        web = new WebView(this);
        web.setVisibility(View.INVISIBLE); // görünmez ama tam boyutlu: sayfa normal yerleşsin
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = (int) (20 * d);
        card.setPadding(pad, pad, pad, (int) (12 * d));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#1d2026"));
        bg.setCornerRadius(18 * d);
        card.setBackground(bg);

        ProgressBar pb = new ProgressBar(this);
        card.addView(pb, new LinearLayout.LayoutParams((int) (36 * d), (int) (36 * d)));
        status = new TextView(this);
        status.setText(getString(R.string.fetching) + "\n" + Uri.parse(url).getHost());
        status.setTextColor(Color.parseColor("#e8e6e1"));
        status.setTextSize(15);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, (int) (12 * d), 0, (int) (4 * d));
        card.addView(status);
        Button cancel = new Button(this);
        cancel.setText(android.R.string.cancel);
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { giveUp("iptal edildi"); }
        });
        card.addView(cancel);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams((int) (280 * d), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(card, lp);
        setContentView(root);
    }

    private void schedule(long ms) {
        h.removeCallbacks(check);
        h.postDelayed(check, ms);
    }

    private final Runnable check = new Runnable() {
        @Override
        public void run() {
            if (done || extracting) return;
            web.evaluateJavascript(CHECK_JS, new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String v) {
                    if (done || extracting) return;
                    boolean wait = false;
                    try {
                        JSONObject o = new JSONObject(unquote(v));
                        boolean challenge = o.optBoolean("ch");
                        if (challenge) status.setText(getString(R.string.fetching_check) + "\n" + Uri.parse(url).getHost());
                        wait = challenge || o.optInt("len") < 400 || !"complete".equals(o.optString("ready"));
                    } catch (Exception ignored) {}
                    if (wait && System.currentTimeMillis() - startedAt < GIVE_UP_MS - 4000) schedule(CHECK_EVERY_MS);
                    else extract();
                }
            });
        }
    };

    private void extract() {
        extracting = true;
        String lib;
        try {
            lib = asset("readability.js") + "\n;\n" + asset("page-extract.js");
        } catch (Exception e) {
            giveUp("Readability yüklenemedi");
            return;
        }
        String js = "(function(){try{" + lib
                + "\nvar a=extractArticle(document.cloneNode(true),location.href);a.url=location.href;return JSON.stringify(a);"
                + "}catch(e){return JSON.stringify({error:String(e&&e.message||e)});}})()";
        web.evaluateJavascript(js, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                try {
                    JSONObject a = new JSONObject(unquote(v));
                    if (a.has("error")) { giveUp("yazı çıkarılamadı: " + a.optString("error")); return; }
                    JSONArray blocks = a.optJSONArray("blocks");
                    if (blocks == null || blocks.length() == 0) { giveUp("sayfada yazı bulunamadı"); return; }
                    String json = a.toString();
                    while (json.length() > MAX_JSON && blocks.length() > 10) { // çok uzunsa sondan kırp
                        JSONArray cut = new JSONArray();
                        for (int i = 0; i < blocks.length() * 3 / 4; i++) cut.put(blocks.get(i));
                        a.put("blocks", blocks = cut);
                        json = a.toString();
                    }
                    finishWith(LensLauncher.dataUri(url, title, "page", json));
                } catch (Exception e) {
                    giveUp("sonuç okunamadı");
                }
            }
        });
    }

    /** Lens yine de açılır: kendi yollarını (Jina) dener, nedeni Teknik ayrıntı'da görünür. */
    private void giveUp(String why) {
        finishWith(LensLauncher.dataUri(url, title, "perr", "telefon: " + why));
    }

    private void finishWith(Uri target) {
        if (done) return;
        done = true;
        h.removeCallbacksAndMessages(null);
        LensLauncher.open(this, target);
        finish();
    }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }

    private String asset(String name) throws Exception {
        InputStream is = getAssets().open(name);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        is.close();
        return bo.toString("UTF-8");
    }

    /** evaluateJavascript sonucu JSON metni olarak tırnaklı gelir: çöz. */
    private static String unquote(String v) throws Exception {
        if (v == null || v.equals("null")) return "{}";
        return new JSONArray("[" + v + "]").getString(0);
    }
}
