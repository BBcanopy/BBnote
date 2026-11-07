package me.jybb.bbnote;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BBNoteNativePlugin.class);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        if (BuildConfig.DEBUG) {
            getBridge().getWebView().getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
