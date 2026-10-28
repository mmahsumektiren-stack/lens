package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.widget.Toast;

import java.util.List;

/** Lens PWA'sını verilen adresle açar: önce Chrome'un kurduğu Lens uygulamasını (WebAPK) arar, yoksa tarayıcıda açar. */
final class LensLauncher {
    static final String BASE = Config.BASE; // asıl Lens ya da test kopyası (build.sh belirler)
    static final int MAX_TEXT = 30000;

    private LensLauncher() {}

    static Uri textUri(String text) {
        if (text.length() > MAX_TEXT) text = text.substring(0, MAX_TEXT);
        return Uri.parse(BASE).buildUpon().appendQueryParameter("text", text).build();
    }

    /** Lens'i açar; büyük veri adresin # kısmında gider (sunucuya gönderilmez, adres sınırına takılmaz). */
    static Uri dataUri(String url, String title, String key, String value) {
        Uri.Builder b = Uri.parse(BASE).buildUpon();
        if (url != null) b.appendQueryParameter("url", url);
        if (title != null && !title.isEmpty()) b.appendQueryParameter("title", title);
        if (key != null && value != null) b.encodedFragment(key + "=" + Uri.encode(value));
        return b.build();
    }

    static void open(Activity from, Uri uri) {
        Intent view = new Intent(Intent.ACTION_VIEW, uri);
        view.addCategory(Intent.CATEGORY_BROWSABLE);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        // Chrome'dan "Uygulamayı yükle" ile kurulan PWA'lar org.chromium.webapk.* paketidir
        PackageManager pm = from.getPackageManager();
        List<ResolveInfo> handlers = pm.queryIntentActivities(view, PackageManager.MATCH_ALL);
        // Lens ve Lens Test ikisi de kuruluysa ikisi de bu adresi açabilir: adına bakarak doğrusunu seç
        String fallback = null;
        for (ResolveInfo ri : handlers) {
            String pkg = ri.activityInfo != null ? ri.activityInfo.packageName : null;
            if (pkg == null || !pkg.startsWith("org.chromium.webapk")) continue;
            boolean isTest = String.valueOf(ri.loadLabel(pm)).contains("Test");
            if (isTest == Config.DEV) { fallback = pkg; break; }
            if (fallback == null) fallback = pkg;
        }
        if (fallback != null) view.setPackage(fallback);
        try {
            from.startActivity(view);
        } catch (ActivityNotFoundException e) {
            view.setPackage(null);
            try {
                from.startActivity(view);
            } catch (ActivityNotFoundException e2) {
                Toast.makeText(from, R.string.not_found, Toast.LENGTH_LONG).show();
            }
        }
    }
}
