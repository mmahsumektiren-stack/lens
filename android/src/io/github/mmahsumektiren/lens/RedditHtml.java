package io.github.mmahsumektiren.lens;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reddit'in normal web sayfasını (shreddit) okur: gönderi + yorumlar (puan, derinlik).
 * JSON uç noktası engellendiğinde kullanılır. Android'e bağımlı değil (masaüstünde test edilebilir).
 */
final class RedditHtml {
    static final class Comment {
        String author = "", body = "", id = "";
        int score, depth;
        boolean hasScore;
    }

    static final class Post {
        String title = "", author = "", sub = "", created = "", flair = "", body = "", id = "";
        int score = -1, comments = -1;
        final List<Comment> list = new ArrayList<Comment>();
    }

    private static final Pattern ATTR = Pattern.compile("([a-zA-Z_:][-a-zA-Z0-9_:.]*)\\s*=\\s*\"([^\"]*)\"");

    private RedditHtml() {}

    static Map<String, String> attrs(String tag) {
        Map<String, String> m = new HashMap<String, String>();
        Matcher a = ATTR.matcher(tag);
        while (a.find()) m.put(a.group(1), unescape(a.group(2)));
        return m;
    }

    /** "<tag ...>" açılış etiketini bulur; [başlangıç, bitiş) döndürür. */
    private static int[] openTag(String html, String name, int from) {
        int s = html.indexOf("<" + name, from);
        while (s >= 0) {
            char c = s + name.length() + 1 < html.length() ? html.charAt(s + name.length() + 1) : '>';
            if (Character.isWhitespace(c) || c == '>') break;
            s = html.indexOf("<" + name, s + 1);
        }
        if (s < 0) return null;
        int e = html.indexOf('>', s);
        return e < 0 ? null : new int[]{s, e + 1};
    }

    /** id="…" taşıyan elemanın iç HTML'i (div sayarak eşleşen kapanışa kadar). */
    static String innerById(String html, String id, int from) {
        int at = html.indexOf("id=\"" + id + "\"", from);
        if (at < 0) return null;
        int s = html.lastIndexOf('<', at);
        if (s < 0) return null;
        int e = html.indexOf('>', at);
        if (e < 0) return null;
        String tagName = html.substring(s + 1).split("[\\s>]", 2)[0];
        int depth = 1, i = e + 1;
        Pattern p = Pattern.compile("<(/?)" + Pattern.quote(tagName) + "(?=[\\s>])", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(html);
        m.region(i, html.length());
        while (m.find()) {
            if (m.group(1).isEmpty()) depth++;
            else if (--depth == 0) return html.substring(i, m.start());
        }
        return null;
    }

    static String unescape(String s) {
        if (s == null || s.indexOf('&') < 0) return s;
        StringBuilder out = new StringBuilder();
        Matcher m = Pattern.compile("&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp|#39);").matcher(s);
        int last = 0;
        while (m.find()) {
            out.append(s, last, m.start());
            String g = m.group(1);
            if (g.startsWith("#x")) out.appendCodePoint(Integer.parseInt(g.substring(2), 16));
            else if (g.startsWith("#")) out.appendCodePoint(Integer.parseInt(g.substring(1)));
            else if (g.equals("amp")) out.append('&');
            else if (g.equals("lt")) out.append('<');
            else if (g.equals("gt")) out.append('>');
            else if (g.equals("quot")) out.append('"');
            else if (g.equals("apos")) out.append('\'');
            else out.append(' ');
            last = m.end();
        }
        return out.append(s.substring(last)).toString();
    }

    /** HTML gövdesini Lens'in anladığı sade metne (paragraflar, "- " listeler, "> " alıntılar) çevirir. */
    static String toText(String html) {
        if (html == null) return "";
        String t = html.replaceAll("(?is)<(script|style|svg|button|faceplate-[a-z-]+)[^>]*>.*?</\\1>", "");
        t = t.replaceAll("(?i)<br\\s*/?>", "\n");
        t = t.replaceAll("(?i)<li[^>]*>", "\n- ");
        t = t.replaceAll("(?i)<blockquote[^>]*>\\s*", "\n> ");
        t = t.replaceAll("(?i)</(p|li|ul|ol|blockquote|h[1-6]|pre|table|tr|div)>", "\n\n");
        t = t.replaceAll("<[^>]+>", "");
        t = unescape(t).replace('\u00a0', ' ');
        t = t.replaceAll("[ \\t]+", " ").replaceAll(" *\n *", "\n").replaceAll("\n{3,}", "\n\n");
        t = t.replaceAll("\n\n(- )", "\n$1"); // liste öğeleri arasında boşluk bırakma
        return t.trim();
    }

    private static int num(String s, int def) {
        if (s == null) return def;
        try { return (int) Double.parseDouble(s.trim()); } catch (Exception e) { return def; }
    }

    static Post parse(String html) {
        Post p = new Post();
        int[] pt = openTag(html, "shreddit-post", 0);
        if (pt == null) return null;
        Map<String, String> a = attrs(html.substring(pt[0], pt[1]));
        p.title = a.containsKey("post-title") ? a.get("post-title") : "";
        p.author = a.containsKey("author") ? a.get("author") : "";
        p.sub = a.containsKey("subreddit-prefixed-name") ? a.get("subreddit-prefixed-name") : "";
        p.created = a.containsKey("created-timestamp") ? a.get("created-timestamp") : "";
        p.score = num(a.get("score"), -1);
        p.comments = num(a.get("comment-count"), -1);
        p.id = a.containsKey("id") ? a.get("id") : "";
        if (p.title.isEmpty()) return null;

        int endPost = html.indexOf("</shreddit-post>", pt[1]);
        if (endPost < 0) endPost = html.length();
        Matcher fl = Pattern.compile("(?is)<shreddit-post-flair[^>]*>(.*?)</shreddit-post-flair>").matcher(html);
        fl.region(pt[1], endPost);
        if (fl.find()) p.flair = toText(fl.group(1)).replaceAll("\\s+", " ").trim();
        if (!p.id.isEmpty()) {
            String body = innerById(html, p.id + "-post-rtjson-content", pt[1]);
            if (body != null) p.body = toText(body);
        }
        addComments(p, html);
        return p;
    }

    /** Sayfadaki (ya da yorum ağacı parçasındaki) shreddit-comment etiketlerini sırayla ekler. */
    static void addComments(Post p, String html) {
        int from = 0;
        int[] ct;
        while ((ct = openTag(html, "shreddit-comment", from)) != null) {
            from = ct[1];
            Map<String, String> a = attrs(html.substring(ct[0], ct[1]));
            Comment c = new Comment();
            c.author = a.containsKey("author") ? a.get("author") : "";
            c.depth = num(a.get("depth"), 0);
            c.hasScore = a.containsKey("score");
            c.score = num(a.get("score"), 0);
            c.id = a.containsKey("thingid") ? a.get("thingid") : "";
            if (c.id.isEmpty()) continue;
            boolean dup = false;
            for (Comment x : p.list) if (x.id.equals(c.id)) { dup = true; break; }
            if (dup) continue;
            String body = innerById(html, c.id + "-comment-rtjson-content", ct[1]);
            if (body == null) continue;
            c.body = toText(body);
            if (c.body.isEmpty() || c.author.isEmpty() || "AutoModerator".equals(c.author)) continue;
            p.list.add(c);
        }
    }
}
