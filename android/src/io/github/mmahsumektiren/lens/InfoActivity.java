package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Uygulama simgesine dokununca: nasıl kullanılacağını anlatır ve Lens'i açar. */
public class InfoActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, pad);

        TextView info = new TextView(this);
        info.setText(getText(R.string.info_text)); // <b> biçimini korur
        info.setTextSize(16);
        box.addView(info);

        Button open = new Button(this);
        open.setText(R.string.open_lens);
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                LensLauncher.open(InfoActivity.this, Uri.parse(LensLauncher.BASE));
                finish();
            }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.END;
        lp.topMargin = pad / 2;
        box.addView(open, lp);

        setContentView(box);
    }
}
