package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Seçim menüsündeki "Lens": seçilen metni Lens'te açar ve hemen kapanır (ekranda hiçbir şey görünmez). */
public class ProcessTextActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CharSequence selected = getIntent().getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        String text = selected == null ? "" : selected.toString().trim();
        if (!text.isEmpty()) {
            LensLauncher.open(this, LensLauncher.textUri(text));
        }
        finish();
    }
}
