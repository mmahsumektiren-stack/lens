package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.net.Uri;

/** Kutucuktan açılır: panoyu okur (Android panoyu sadece öndeki pencereye verir, bu yüzden görünmez bir pencere açıyoruz). */
public class ClipActivity extends Activity {
    private boolean done = false;

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus || done) return;
        done = true;
        String text = "";
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            ClipData clip = cm != null ? cm.getPrimaryClip() : null;
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(this);
                if (t != null) text = t.toString().trim();
            }
        } catch (Exception ignored) {
        }
        if (text.isEmpty()) {
            LensLauncher.open(this, Uri.parse(LensLauncher.BASE + "?view=add"));
        } else {
            LensLauncher.open(this, LensLauncher.textUri(text));
        }
        finish();
    }
}
