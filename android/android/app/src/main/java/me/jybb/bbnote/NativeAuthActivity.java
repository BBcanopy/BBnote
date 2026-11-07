package me.jybb.bbnote;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsIntent;
import net.openid.appauth.AuthState;
import net.openid.appauth.AuthorizationRequest;
import net.openid.appauth.AuthorizationResponse;
import net.openid.appauth.AuthorizationServiceConfiguration;
import net.openid.appauth.ResponseTypeValues;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.net.HttpURLConnection;

/** Owns OAuth results independently of the WebView and Android's transient activity state. */
public class NativeAuthActivity extends Activity {
    private NativeSession session;
    private int generation;
    private String flowState;
    private boolean browserLaunched;
    private boolean exchanging;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        session = NativeSession.get(this);
        generation = getIntent().getIntExtra("generation", session.generation());
        if (getIntent().getData() != null) { complete(getIntent().getData()); return; }
        if (saved != null) {
            browserLaunched = saved.getBoolean("browserLaunched");
            flowState = saved.getString("flowState");
            return;
        }
        if (getCallingActivity() == null || !getPackageName().equals(getCallingActivity().getPackageName())) {
            finish(); return;
        }
        try {
            JSONObject config = session.config();
            if (config == null) throw new IllegalStateException("Connect to a server first.");
            String issuer = config.getString("issuer").replaceAll("/+$", "");
            AuthorizationServiceConfiguration.fetchFromUrl(Uri.parse(issuer + "/.well-known/openid-configuration"), (configuration, error) -> {
                if (isFinishing() || isDestroyed()) return;
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
                    // Commit PKCE verifier, state, and nonce before leaving the app. Activity state can be lost.
                    session.beginAuthorization(request, generation);
                    flowState = request.state;
                    browserLaunched = true;
                    new CustomTabsIntent.Builder().build().launchUrl(this, request.toUri());
                } catch (Exception failure) { finishResult(failure.getMessage()); }
            }, uri -> {
                HttpURLConnection connection = (HttpURLConnection) UrlPolicy.endpoint(uri.toString(), BuildConfig.DEBUG).toURL().openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                return connection;
            });
        } catch (Exception failure) { finishResult(failure.getMessage()); }
    }
    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (intent.getData() != null) complete(intent.getData());
    }
    @Override protected void onResume() {
        super.onResume();
        if (browserLaunched && !exchanging && getIntent().getData() == null) finishResult("Sign-in cancelled.");
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("browserLaunched", browserLaunched);
        state.putString("flowState", flowState);
        super.onSaveInstanceState(state);
    }
    private void complete(Uri uri) {
        if (exchanging) return;
        try {
            if (!"bbnote".equals(uri.getScheme()) || !"auth".equals(uri.getHost()) || !"/callback".equals(uri.getPath()) || uri.getFragment() != null) {
                throw new IllegalStateException("Invalid sign-in callback.");
            }
            flowState = uri.getQueryParameter("state");
            AuthorizationRequest request = session.pendingAuthorization();
            if (request.state == null || !request.state.equals(flowState)) throw new IllegalStateException("Sign-in response did not match. Please retry.");
            if (uri.getQueryParameter("error") != null || uri.getQueryParameter("code") == null) {
                throw new IllegalStateException("Sign-in could not be completed. Please retry.");
            }
            exchanging = true;
            AuthorizationResponse response = new AuthorizationResponse.Builder(request).fromUri(uri).build();
            AuthState auth = new AuthState(response, null);
            session.service.performTokenRequest(response.createTokenExchangeRequest(), (tokens, failure) -> {
                if (tokens == null || failure != null) {
                    if (BuildConfig.DEBUG) android.util.Log.w("BBNoteAuth", "Token exchange failed", failure);
                    finishResult("Could not finish sign-in. Please retry."); return;
                }
                try { auth.update(tokens, null); session.authorize(auth, generation, flowState); finishResult(null); }
                catch (Exception saveFailure) { finishResult(saveFailure.getMessage()); }
            });
        } catch (Exception failure) { finishResult(failure.getMessage()); }
    }
    private void finishResult(String error) {
        runOnUiThread(() -> {
            try { session.cancelAuthorization(flowState, generation); }
            catch (Exception failure) { errorResult("Could not save sign-in state. Please retry."); return; }
            errorResult(error);
        });
    }
    private void errorResult(String error) {
        Intent result = new Intent();
        if (error != null) result.putExtra("error", error);
        setResult(error == null ? RESULT_OK : RESULT_CANCELED, result);
        if (getCallingActivity() == null) startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }
}
