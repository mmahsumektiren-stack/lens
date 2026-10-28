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
 * Girişler: Lens'teki "Lens Seçim ile aç" düğmesi (lensresolve://open?u=…) ya da paylaş menüsündeki "Lens" (ShareActivity).
 */
public class ResolveActivity extends Activity {
    private static final String UA = "Mozilla/5.0 (Linux; Android 14; 23127PN0CG) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    private static final Pattern POST = Pattern.compile("/r/[^/]+/comments/[a-z0-9]+[^?#]*|/comments/[a-z0-9]+[^?#]*", Pattern.CASE_INSENSITIVE);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        String start = in != null && in.getData() != null ? in.getData().getQueryParameter("u") : null;
        if (start == null || !start.startsWith("http")) { finish(); return; }

        final String url = start.replaceFirst("^http://", "https://");
        Toast.makeText(this, R.string.resolving, Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override
            public void run() {
                String post = null, data = null;
                StringBuilder err = new StringBuilder();
                try {
                    post = resolve(url);
                    if (post == null) err.append("kısa bağlantı çözülemedi");
                    else data = fetchPost(post, err);
                } catch (Exception e) {
                    err.append(e.getClass().getSimpleName()).append(": ").append(e.getMessage());
                }
                final String fPost = post, fData = data, fErr = err.toString();
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (fData == null) Toast.makeText(ResolveActivity.this, R.string.resolve_failed, Toast.LENGTH_LONG).show();
                        LensLauncher.open(ResolveActivity.this, LensLauncher.dataUri(fPost != null ? fPost : url, null,
                                fData != null ? "reddit" : "perr", fData != null ? fData : "Lens Seçim: " + fErr));
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
            Uri cu = Uri.parse(cur);
            Matcher m = POST.matcher(cu.getEncodedPath() == null ? "" : cu.getEncodedPath());
            if (m.find() && cu.getHost() != null && cu.getHost().endsWith("reddit.com")) {
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

    private static final Pattern ID = Pattern.compile("/comments/([a-z0-9]+)", Pattern.CASE_INSENSITIVE);

    /** İstek atar (yönlendirmeleri takip eder); 200 değilse hata nedenini err'e yazar. */
    private static String get(String u, String accept, String label, StringBuilder err) {
        for (int hop = 0; hop < 4; hop++) {
            HttpURLConnection c = null;
            try {
                c = open(u, accept);
                int code = c.getResponseCode();
                String loc = c.getHeaderField("Location");
                if (code >= 300 && code < 400 && loc != null) { u = new URL(new URL(u), loc).toString(); continue; }
                if (code != 200) { err.append(label).append(": HTTP ").append(code).append(" · "); return null; }
                return read(c.getInputStream());
            } catch (Exception e) {
                err.append(label).append(": ").append(e.getClass().getSimpleName()).append(" · ");
                return null;
            } finally {
                if (c != null) c.disconnect();
            }
        }
        err.append(label).append(": çok fazla yönlendirme · ");
        return null;
    }

    /** Gönderiyi alır, Lens'in kullandığı alanlara indirger: {"path":…, "j":[gönderi, yorumlar]}. Önce JSON, olmazsa RSS. */
    static String fetchPost(String postUrl, StringBuilder err) {
        String encPath = Uri.parse(postUrl).getEncodedPath();
        Matcher m = ID.matcher(encPath == null ? "" : encPath);
        if (!m.find()) { err.append("gönderi kimliği yok"); return null; }
        String id = m.group(1);
        String path = encPath.replaceAll("/+$", "");
        String q = "?raw_json=1&limit=40&sort=confidence";
        String[][] tries = {
                {"https://www.reddit.com/comments/" + id + ".json" + q, "www"},
                {"https://old.reddit.com/comments/" + id + ".json" + q, "old"},
                {"https://api.reddit.com/comments/" + id + q, "api"}
        };
        for (String[] t : tries) {
            String body = get(t[0], "application/json", t[1], err);
            if (body == null) continue;
            try {
                return slim(new JSONArray(body), path).put("via", "json").toString();
            } catch (Exception e) {
                err.append(t[1]).append(": JSON değil · ");
            }
        }
        // normal web sayfası (puanlar, yanıtlar, "en iyi" sıralaması burada da var)
        String page = get("https://www.reddit.com" + path + "/", "text/html,application/xhtml+xml", "sayfa", err);
        if (page != null) {
            try {
                RedditHtml.Post p = RedditHtml.parse(page);
                if (p == null) err.append("sayfa: gönderi bulunamadı · ");
                else {
                    if (p.list.isEmpty()) {
                        String sub = p.sub.isEmpty() ? path.replaceFirst("^/(r/[^/]+)/.*", "$1") : p.sub;
                        String part = get("https://www.reddit.com/svc/shreddit/comments/" + sub + "/t3_" + id + "?sort=confidence",
                                "text/html", "yorumlar", err);
                        if (part != null) RedditHtml.addComments(p, part);
                    }
                    return fromPage(p, path).put("via", "page").put("diag", err.toString()).toString();
                }
            } catch (Exception e) {
                err.append("sayfa: ").append(e.getClass().getSimpleName()).append(" · ");
            }
        }
        String rss = get("https://www.reddit.com/comments/" + id + "/.rss?sort=top&limit=40", "application/atom+xml,application/xml", "rss", err);
        if (rss != null) {
            try {
                JSONObject r = fromRss(rss, path);
                return r.put("via", "rss").put("diag", err.toString()).toString();
            } catch (Exception e) {
                err.append("rss: okunamadı · ");
            }
        }
        return null;
    }

    /** Web sayfasından okunan gönderiyi Lens'in beklediği JSON biçimine çevirir. */
    private static JSONObject fromPage(RedditHtml.Post p, String path) throws Exception {
        JSONObject post = new JSONObject().put("title", p.title).put("selftext", cut(p.body, 20000)).put("is_self", true)
                .put("author", p.author).put("subreddit_name_prefixed", p.sub).put("created_iso", p.created).put("url", "")
                .put("link_flair_text", p.flair);
        if (p.score >= 0) post.put("score", p.score);
        if (p.comments >= 0) post.put("num_comments", p.comments);
        JSONArray out = new JSONArray();
        for (int i = 0; i < p.list.size() && out.length() < 15; i++) {
            RedditHtml.Comment c = p.list.get(i);
            if (c.depth != 0) continue;
            JSONObject cd = new JSONObject().put("author", c.author).put("body", cut(c.body, 3000)).put("stickied", false);
            if (c.hasScore) cd.put("score", c.score);
            for (int k = i + 1; k < p.list.size() && p.list.get(k).depth > 0; k++) {
                RedditHtml.Comment r = p.list.get(k);
                if (r.depth == 1 && (!r.hasScore || r.score > 1)) {
                    JSONObject rd = new JSONObject().put("author", r.author).put("body", cut(r.body, 2000));
                    if (r.hasScore) rd.put("score", r.score);
                    cd.put("replies", listing(new JSONArray().put(new JSONObject().put("kind", "t1").put("data", rd))));
                    break;
                }
            }
            out.put(new JSONObject().put("kind", "t1").put("data", cd));
        }
        return new JSONObject().put("path", path).put("j", new JSONArray()
                .put(listing(new JSONArray().put(new JSONObject().put("kind", "t3").put("data", post))))
                .put(listing(out)));
    }

    private static String plain(String html) {
        if (html == null) return "";
        String t = android.text.Html.fromHtml(html, android.text.Html.FROM_HTML_MODE_LEGACY).toString();
        t = t.replace("\uFFFC", "").replaceAll("\\[link\\]|\\[comments\\]|submitted by\\s+/u/\\S+(\\s+to\\s+r/\\S+)?", "");
        return t.replaceAll("\n{3,}", "\n\n").trim();
    }

    /** RSS (Atom) yedeği: ilk kayıt gönderi, sonrakiler yorumlar (puan bilgisi yok). */
    private static JSONObject fromRss(String xml, String path) throws Exception {
        org.xmlpull.v1.XmlPullParser x = android.util.Xml.newPullParser();
        x.setInput(new java.io.StringReader(xml));
        JSONObject post = null;
        JSONArray out = new JSONArray();
        String tag = null, title = "", author = "", content = "", updated = "";
        boolean inEntry = false;
        for (int ev = x.getEventType(); ev != org.xmlpull.v1.XmlPullParser.END_DOCUMENT; ev = x.next()) {
            if (ev == org.xmlpull.v1.XmlPullParser.START_TAG) {
                tag = x.getName();
                if ("entry".equals(tag)) { inEntry = true; title = ""; author = ""; content = ""; updated = ""; }
            } else if (ev == org.xmlpull.v1.XmlPullParser.TEXT && inEntry && tag != null) {
                String v = x.getText();
                if ("title".equals(tag)) title += v;
                else if ("name".equals(tag)) author += v;
                else if ("content".equals(tag)) content += v;
                else if ("published".equals(tag) || ("updated".equals(tag) && updated.isEmpty())) updated = v;
            } else if (ev == org.xmlpull.v1.XmlPullParser.END_TAG) {
                if ("entry".equals(x.getName())) {
                    inEntry = false;
                    String who = author.trim().replaceFirst("^/?u/", "");
                    if (post == null) {
                        post = new JSONObject().put("title", title.trim()).put("selftext", cut(plain(content), 20000))
                                .put("is_self", true).put("author", who)
                                .put("subreddit_name_prefixed", path.replaceFirst("^/(r/[^/]+)/.*", "$1"))
                                .put("created_iso", updated.trim()).put("url", "");
                    } else if (out.length() < 15 && !"AutoModerator".equals(who)) {
                        String body = plain(content);
                        if (!body.isEmpty()) out.put(new JSONObject().put("kind", "t1").put("data",
                                new JSONObject().put("author", who).put("body", cut(body, 3000)).put("stickied", false)));
                    }
                }
                tag = null;
            }
        }
        if (post == null) throw new Exception("boş");
        JSONArray j = new JSONArray()
                .put(listing(new JSONArray().put(new JSONObject().put("kind", "t3").put("data", post))))
                .put(listing(out));
        return new JSONObject().put("path", path).put("j", j);
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
                .put("url", p.optString("url"))
                .put("score", p.optInt("score"))
                .put("num_comments", p.optInt("num_comments"))
                .put("link_flair_text", p.optString("link_flair_text", ""));
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
