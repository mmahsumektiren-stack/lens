package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Lens'in "Reddit bağlantısını çöz" düğmesi buraya gelir (lensresolve://open?u=…).
 * Reddit uygulamasının kısa paylaş bağlantılarını (/r/x/s/…) telefonun kendi bağlantısıyla çözer
 * ve gerçek gönderi adresini Lens'e geri verir. Tarayıcı bunu yapamaz (Reddit yönlendirmesinde CORS yok).
 */
public class ResolveActivity extends Activity {
    private static final String UA = "Mozilla/5.0 (Linux; Android 14; 23127PN0CG) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent() != null ? getIntent().getData() : null;
        final String start = data != null ? data.getQueryParameter("u") : null;
        if (start == null || !start.startsWith("https://")) {
            finish();
            return;
        }
        Toast.makeText(this, R.string.resolving, Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String resolved = resolve(start);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (resolved == null) {
                            Toast.makeText(ResolveActivity.this, R.string.resolve_failed, Toast.LENGTH_LONG).show();
                        }
                        String target = resolved != null ? resolved : start;
                        LensLauncher.open(ResolveActivity.this,
                                Uri.parse(LensLauncher.BASE).buildUpon().appendQueryParameter("url", target).build());
                        finish();
                    }
                });
            }
        }).start();
    }

    /** Yönlendirmeleri elle takip eder; gönderi adresine (/comments/) ulaşınca onu döndürür. */
    static String resolve(String url) {
        String cur = url;
        for (int i = 0; i < 6; i++) {
            if (cur.contains("/comments/")) return cur;
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(cur).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(10000);
                c.setReadTimeout(10000);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Accept", "text/html,application/xhtml+xml");
                c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
                int code = c.getResponseCode();
                String loc = c.getHeaderField("Location");
                if (code >= 300 && code < 400 && loc != null) {
                    cur = new URL(new URL(cur), loc).toString();
                    continue;
                }
                return null;
            } catch (Exception e) {
                return null;
            } finally {
                if (c != null) c.disconnect();
            }
        }
        return cur.contains("/comments/") ? cur : null;
    }
}
