package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reddit gönderilerini telefonun kendi bağlantısıyla alır ve Lens'e veri olarak verir.
 * Reddit, tarayıcıdaki web uygulamalarının (Lens PWA) gönderiyi okumasına izin vermiyor; yerel uygulama okuyabiliyor.
 * Girişler: Lens'teki "Lens Seçim ile aç" düğmesi (lensresolve://open?u=…) ya da paylaş menüsündeki "Lens Reddit".
 */
public class ResolveActivity extends Activity {
    private static final String UA = "Mozilla/5.0 (Linux; Android 14; 23127PN0CG) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    private static final Pattern REDDIT = Pattern.compile("https?://(?:[a-z0-9-]+\\.)?(?:reddit\\.com|redd\\.it)/\\S+", Pattern.CASE_INSENSITIVE);
    private static final Pattern POST = Pattern.compile("/r/[^/]+/comments/[a-z0-9]+[^?#]*|/comments/[a-z0-9]+[^?#]*", Pattern.CASE_INSENSITIVE);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        String start = null;
        if (in != null && Intent.ACTION_SEND.equals(in.getAction())) {
            String text = in.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null) { finish(); return; }
            Matcher m = REDDIT.matcher(text);
            if (!m.find()) { // Reddit değilse metni olduğu gibi Lens'e ver
                LensLauncher.open(this, LensLauncher.textUri(text));
                finish();
                return;
            }
            start = m.group();
        } else if (in != null && in.getData() != null) {
            start = in.getData().getQueryParameter("u");
        }
        if (start == null || !start.startsWith("http")) { finish(); return; }

        final String url = start.replaceFirst("^http://", "https://");
        Toast.makeText(this, R.string.resolving, Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override
            public void run() {
                String post = null, data = null;
                try {
                    post = resolve(url);
                    if (post != null) data = fetchPost(post);
                } catch (Exception ignored) {}
                final String fPost = post, fData = data;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Uri.Builder b = Uri.parse(LensLauncher.BASE).buildUpon()
                                .appendQueryParameter("url", fPost != null ? fPost : url);
                        if (fData != null) b.appendQueryParameter("reddit", fData);
                        else Toast.makeText(ResolveActivity.this, R.string.resolve_failed, Toast.LENGTH_LONG).show();
                        LensLauncher.open(ResolveActivity.this, b.build());
                        finish();
                    }
                });
            }
        }).start();
    }

    private static HttpURLConnection open(String url, String accept) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(12000);
        c.setReadTimeout(15000);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("Accept", accept);
        c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
        return c;
    }

    /** Kısa paylaş bağlantısını (/s/…, redd.it) gönderi adresine çevirir. */
    static String resolve(String url) {
        String cur = url;
        for (int i = 0; i < 6; i++) {
            Matcher m = POST.matcher(Uri.parse(cur).getPath() == null ? "" : Uri.parse(cur).getPath());
            if (m.find() && Uri.parse(cur).getHost() != null && Uri.parse(cur).getHost().endsWith("reddit.com")) {
                return "https://www.reddit.com" + m.group().replaceAll("/+$", "");
            }
            HttpURLConnection c = null;
            try {
                c = open(cur, "text/html,application/xhtml+xml");
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
        return null;
    }

    private static String read(InputStream is) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        is.close();
        return bo.toString("UTF-8");
    }

    /** Gönderinin JSON'unu alır, Lens'in kullandığı alanlara indirger: {"path":…, "j":[gönderi, yorumlar]} */
    static String fetchPost(String postUrl) throws Exception {
        String path = Uri.parse(postUrl).getPath();
        String[] bases = {"https://www.reddit.com", "https://old.reddit.com"};
        for (String base : bases) {
            String u = base + path + ".json?raw_json=1&limit=40&sort=top";
            for (int hop = 0; hop < 3; hop++) {
                HttpURLConnection c = null;
                try {
                    c = open(u, "application/json");
                    int code = c.getResponseCode();
                    String loc = c.getHeaderField("Location");
                    if (code >= 300 && code < 400 && loc != null) { u = new URL(new URL(u), loc).toString(); continue; }
                    if (code != 200) break;
                    JSONArray raw = new JSONArray(read(c.getInputStream()));
                    return slim(raw, path).toString();
                } catch (Exception e) {
                    break;
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }
        return null;
    }

    private static String cut(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }

    private static JSONObject listing(JSONArray children) throws Exception {
        return new JSONObject().put("data", new JSONObject().put("children", children));
    }

    private static JSONObject slim(JSONArray raw, String path) throws Exception {
        JSONObject p = raw.getJSONObject(0).getJSONObject("data").getJSONArray("children").getJSONObject(0).getJSONObject("data");
        JSONObject post = new JSONObject()
                .put("title", p.optString("title"))
                .put("selftext", cut(p.optString("selftext"), 20000))
                .put("is_self", p.optBoolean("is_self"))
                .put("author", p.optString("author"))
                .put("subreddit", p.optString("subreddit"))
                .put("subreddit_name_prefixed", p.optString("subreddit_name_prefixed"))
                .put("created_utc", p.optDouble("created_utc", 0))
                .put("url", p.optString("url"));
        JSONObject prev = p.optJSONObject("preview");
        if (prev != null && prev.optJSONArray("images") != null && prev.getJSONArray("images").length() > 0) {
            JSONObject src = prev.getJSONArray("images").getJSONObject(0).optJSONObject("source");
            if (src != null) post.put("preview", new JSONObject().put("images",
                    new JSONArray().put(new JSONObject().put("source", new JSONObject().put("url", src.optString("url"))))));
        }

        JSONArray out = new JSONArray();
        JSONArray cs = raw.length() > 1 ? raw.getJSONObject(1).getJSONObject("data").getJSONArray("children") : new JSONArray();
        for (int i = 0; i < cs.length() && out.length() < 15; i++) {
            JSONObject c = cs.getJSONObject(i);
            if (!"t1".equals(c.optString("kind"))) continue;
            JSONObject d = c.getJSONObject("data");
            String body = d.optString("body");
            if (body.isEmpty() || d.optBoolean("stickied") || "AutoModerator".equals(d.optString("author"))
                    || body.equals("[deleted]") || body.equals("[removed]")) continue;
            JSONObject cd = new JSONObject().put("author", d.optString("author")).put("score", d.optInt("score"))
                    .put("body", cut(body, 3000)).put("stickied", false);
            JSONObject reps = d.optJSONObject("replies");
            if (reps != null && reps.optJSONObject("data") != null) {
                JSONArray rc = reps.getJSONObject("data").optJSONArray("children");
                for (int k = 0; rc != null && k < rc.length(); k++) {
                    JSONObject r = rc.getJSONObject(k);
                    JSONObject rd = r.optJSONObject("data");
                    if ("t1".equals(r.optString("kind")) && rd != null && !rd.optString("body").isEmpty() && rd.optInt("score") > 1) {
                        cd.put("replies", listing(new JSONArray().put(new JSONObject().put("kind", "t1").put("data",
                                new JSONObject().put("author", rd.optString("author")).put("score", rd.optInt("score"))
                                        .put("body", cut(rd.optString("body"), 2000))))));
                        break;
                    }
                }
            }
            out.put(new JSONObject().put("kind", "t1").put("data", cd));
        }
        JSONArray j = new JSONArray()
                .put(listing(new JSONArray().put(new JSONObject().put("kind", "t3").put("data", post))))
                .put(listing(out));
        return new JSONObject().put("path", path).put("j", j);
    }
}
