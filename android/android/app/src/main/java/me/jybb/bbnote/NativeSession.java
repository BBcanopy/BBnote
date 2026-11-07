package me.jybb.bbnote;

import android.content.Context;
import net.openid.appauth.AuthState;
import net.openid.appauth.AppAuthConfiguration;
import net.openid.appauth.AuthorizationException;
import net.openid.appauth.AuthorizationService;
import net.openid.appauth.AuthorizationRequest;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.List;

final class NativeSession {
    interface TokenResult { void done(String token, Exception error); }
    private static NativeSession instance;
    static synchronized NativeSession get(Context context) {
        if (instance == null) instance = new NativeSession(context.getApplicationContext());
        return instance;
    }
    final AuthorizationService service;
    private final SecureStore store;
    private JSONObject data;
    private AuthState auth;
    private int generation;
    private List<TokenResult> pending;
    private NativeSession(Context context) {
        store = new SecureStore(context);
        try { data = new JSONObject(store.read()); generation = data.optInt("generation", 0); auth = data.has("auth") ? AuthState.jsonDeserialize(data.getString("auth")) : null; }
        catch (Exception failure) { store.clear(); data = new JSONObject(); }
        // UrlPolicy still restricts debug HTTP to the three development hosts.
        service = new AuthorizationService(context, new AppAuthConfiguration.Builder().setSkipIssuerHttpsCheck(BuildConfig.DEBUG).setConnectionBuilder(uri -> {
            java.net.URI validated = UrlPolicy.endpoint(uri.toString(), BuildConfig.DEBUG);
            HttpURLConnection connection = (HttpURLConnection) validated.toURL().openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            return connection;
        }).build());
    }
    synchronized String server() { return data.optString("server", null); }
    synchronized JSONObject config() { return data.optJSONObject("config"); }
    synchronized boolean authenticated() { return auth != null && auth.isAuthorized(); }
    synchronized int generation() { return generation; }
    private void persist() throws Exception {
        data.put("generation", generation);
        if (auth == null) data.remove("auth"); else data.put("auth", auth.jsonSerializeString());
        store.write(data.toString());
    }
    synchronized void configure(String server, JSONObject config) throws Exception {
        UrlPolicy.origin(server, BuildConfig.DEBUG); UrlPolicy.endpoint(config.getString("issuer"), BuildConfig.DEBUG);
        generation++; auth = null; data = new JSONObject().put("server", server).put("config", config); persist();
    }
    synchronized void authorize(AuthState state, int version, String expectedState) throws Exception {
        if (version != generation) throw new IllegalStateException("Server changed during sign-in.");
        if (expectedState == null || !expectedState.equals(pendingAuthorization().state)) {
            throw new IllegalStateException("Sign-in was superseded. Please retry.");
        }
        data.remove("pendingAuthorization"); data.remove("authorizationStartedAt");
        auth = state; persist();
    }
    synchronized void beginAuthorization(AuthorizationRequest request, int version) throws Exception {
        if (version != generation) throw new IllegalStateException("Server changed during sign-in.");
        data.put("pendingAuthorization", request.jsonSerializeString());
        data.put("authorizationStartedAt", System.currentTimeMillis()); persist();
    }
    synchronized AuthorizationRequest pendingAuthorization() throws Exception {
        if (!data.has("pendingAuthorization") || System.currentTimeMillis() - data.optLong("authorizationStartedAt") > 600000) {
            throw new IllegalStateException("Sign-in expired. Please try again.");
        }
        return AuthorizationRequest.jsonDeserialize(data.getString("pendingAuthorization"));
    }
    synchronized void cancelAuthorization(String state, int version) throws Exception {
        if (version != generation || state == null || !data.has("pendingAuthorization")) return;
        AuthorizationRequest pendingRequest = AuthorizationRequest.jsonDeserialize(data.getString("pendingAuthorization"));
        if (!state.equals(pendingRequest.state)) return;
        data.remove("pendingAuthorization"); data.remove("authorizationStartedAt"); persist();
    }
    synchronized void signOut(boolean disconnect) throws Exception {
        generation++; auth = null;
        data.remove("pendingAuthorization"); data.remove("authorizationStartedAt");
        if (disconnect) data = new JSONObject();
        persist();
    }
    synchronized void token(TokenResult callback) {
        if (!authenticated()) { callback.done(null, null); return; }
        if (pending != null) { pending.add(callback); return; }
        pending = new ArrayList<>(); pending.add(callback);
        final int version = generation;
        final AuthState refreshing = auth;
        refreshing.performActionWithFreshTokens(service, (access, id, error) -> {
            List<TokenResult> callbacks;
            Exception failure = error;
            synchronized (NativeSession.this) {
                if (version != generation) failure = new IllegalStateException("Server changed.");
                else {
                    try {
                        if (error != null && error.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR
                            && ("invalid_grant".equals(error.error) || "invalid_token".equals(error.error))) auth = null;
                        persist();
                    } catch (Exception saveFailure) { failure = saveFailure; }
                }
                callbacks = pending; pending = null;
            }
            for (TokenResult result : callbacks) result.done(failure == null ? access : null, failure);
        });
    }
}
