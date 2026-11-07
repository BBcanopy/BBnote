package me.jybb.bbnote;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import net.openid.appauth.AuthState;
import net.openid.appauth.AuthorizationException;
import net.openid.appauth.AuthorizationRequest;
import net.openid.appauth.AuthorizationResponse;
import net.openid.appauth.AuthorizationServiceConfiguration;
import net.openid.appauth.ResponseTypeValues;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.net.HttpURLConnection;

/** Owns OAuth results independently of the WebView, including when Android recreates the process. */
public class NativeAuthActivity extends Activity {
    static final String COMPLETE = "me.jybb.bbnote.AUTH_COMPLETE";
    static final String CANCEL = "me.jybb.bbnote.AUTH_CANCEL";
    private NativeSession session;
    private int generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        session = NativeSession.get(this);
        generation = getIntent().getIntExtra("generation", session.generation());
        if (COMPLETE.equals(getIntent().getAction())) { complete(getIntent()); return; }
        if (CANCEL.equals(getIntent().getAction())) { finishResult("Sign-in cancelled."); return; }
        if (state != null) return; // AppAuth's activity is still awaiting the browser redirect.
        try {
            JSONObject config = session.config();
            if (config == null) throw new IllegalStateException("Connect to a server first.");
            String issuer = config.getString("issuer").replaceAll("/+$", "");
            Uri discovery = Uri.parse(issuer + "/.well-known/openid-configuration");
            AuthorizationServiceConfiguration.fetchFromUrl(discovery, (configuration, error) -> {
                if (error != null || configuration == null) { finishResult("Could not load sign-in settings. Check your connection and retry."); return; }
                try {
                    if (configuration.discoveryDoc == null || !issuer.equals(configuration.discoveryDoc.getIssuer().toString().replaceAll("/+$", ""))) {
                        throw new IllegalStateException("OIDC issuer does not match the configured server.");
                    }
                    UrlPolicy.endpoint(configuration.authorizationEndpoint.toString(), BuildConfig.DEBUG);
                    UrlPolicy.endpoint(configuration.tokenEndpoint.toString(), BuildConfig.DEBUG);
                    JSONArray values = config.getJSONArray("scopes");
                    ArrayList<String> scopes = new ArrayList<>();
                    for (int i = 0; i < values.length(); i++) scopes.add(values.getString(i));
                    AuthorizationRequest request = new AuthorizationRequest.Builder(configuration, config.getString("clientId"),
                        ResponseTypeValues.CODE, Uri.parse("bbnote://auth/callback")).setScopes(scopes).build();
                    session.service.performAuthorizationRequest(request, pending(COMPLETE, 1), pending(CANCEL, 2));
                } catch (Exception failure) { finishResult(failure.getMessage()); }
            }, uri -> {
                HttpURLConnection connection = (HttpURLConnection) UrlPolicy.endpoint(uri.toString(), BuildConfig.DEBUG).toURL().openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                return connection;
            });
        } catch (Exception failure) { finishResult(failure.getMessage()); }
    }
    private PendingIntent pending(String action, int code) {
        Intent intent = new Intent(this, NativeAuthActivity.class).setAction(action).putExtra("generation", generation)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }
    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (COMPLETE.equals(intent.getAction())) complete(intent); else finishResult("Sign-in cancelled.");
    }
    private void complete(Intent intent) {
        AuthorizationResponse response = AuthorizationResponse.fromIntent(intent);
        AuthorizationException error = AuthorizationException.fromIntent(intent);
        if (response == null || error != null) { finishResult("Sign-in could not be completed. Please retry."); return; }
        AuthState auth = new AuthState(response, null);
        session.service.performTokenRequest(response.createTokenExchangeRequest(), (tokens, failure) -> {
            if (tokens == null || failure != null) {
                if (BuildConfig.DEBUG) android.util.Log.w("BBNoteAuth", "Token exchange failed", failure);
                finishResult("Could not finish sign-in. Please retry."); return;
            }
            try { auth.update(tokens, null); session.authorize(auth, generation); finishResult(null); }
            catch (Exception saveFailure) { finishResult(saveFailure.getMessage()); }
        });
    }
    private void finishResult(String error) {
        runOnUiThread(() -> {
            Intent result = new Intent();
            if (error != null) result.putExtra("error", error);
            setResult(error == null ? RESULT_OK : RESULT_CANCELED, result);
            // Bring an existing or recreated WebView forward; bootstrap can read the stored AuthState.
            if (getCallingActivity() == null) startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        });
    }
}
