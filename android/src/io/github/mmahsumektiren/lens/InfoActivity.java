package io.github.mmahsumektiren.lens;

import android.app.Activity;
import android.app.StatusBarManager;
import android.content.ComponentName;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;
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

        Button tile = new Button(this);
        tile.setText(R.string.add_tile);
        tile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                requestTile();
            }
        });
        box.addView(tile, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(box);
    }

    /** Android 13+: sistemden "kutucuğu ekle" onay penceresini iste; eski sürümlerde elle eklemeyi anlat. */
    private void requestTile() {
        if (Build.VERSION.SDK_INT >= 33) {
            StatusBarManager sbm = getSystemService(StatusBarManager.class);
            if (sbm != null) {
                sbm.requestAddTileService(
                        new ComponentName(this, LensTileService.class),
                        getString(R.string.tile_label),
                        Icon.createWithResource(this, R.drawable.ic_tile),
                        getMainExecutor(),
                        new java.util.function.Consumer<Integer>() {
                            @Override
                            public void accept(Integer result) {
                                boolean ok = result != null && (result == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED
                                        || result == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED);
                                Toast.makeText(InfoActivity.this, ok ? R.string.tile_added : R.string.tile_manual, Toast.LENGTH_LONG).show();
                            }
                        });
                return;
            }
        }
        Toast.makeText(this, R.string.tile_manual, Toast.LENGTH_LONG).show();
    }
}
