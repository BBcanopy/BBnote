package me.jybb.bbnote;

import static org.junit.Assert.*;
import android.content.Context;
import android.net.Uri;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import net.openid.appauth.*;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class NativeSessionTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    @Test public void encryptsAndRestoresSessionWithoutPlaintextTokens() throws Exception {
        SecureStore store = new SecureStore(context);
        store.write("{\"refresh_token\":\"private-refresh-token\"}");
        String stored = context.getSharedPreferences("native-auth", Context.MODE_PRIVATE).getString("payload", "");
        assertFalse(stored.contains("private-refresh-token"));
        assertEquals("{\"refresh_token\":\"private-refresh-token\"}", new SecureStore(context).read());
        store.clear();
    }
    @Test public void coordinatesRefreshAndClearsTokensOnLogoutAndServerSwitch() throws Exception {
        try (MockWebServer provider = new MockWebServer()) {
            provider.start();
            NativeSession session = NativeSession.get(context);
            String issuer = provider.url("/").toString().replaceAll("/$", "");
            JSONObject config = new JSONObject().put("issuer", issuer).put("clientId", "android").put("scopes", new JSONArray().put("openid"));
            session.configure("https://notes.example", config);
            AuthorizationServiceConfiguration endpoints = new AuthorizationServiceConfiguration(Uri.parse(issuer + "/authorize"), Uri.parse(issuer + "/token"));
            AuthorizationRequest authorization = new AuthorizationRequest.Builder(endpoints, "android", ResponseTypeValues.CODE, Uri.parse("bbnote://auth/callback")).build();
            AuthState state = new AuthState(new AuthorizationResponse.Builder(authorization).setAuthorizationCode("code").build(), null);
            TokenRequest tokenRequest = new TokenRequest.Builder(endpoints, "android").setGrantType(GrantTypeValues.REFRESH_TOKEN).setRefreshToken("refresh-old").build();
            state.update(new TokenResponse.Builder(tokenRequest).setTokenType("Bearer").setAccessToken("expired")
                .setAccessTokenExpirationTime(System.currentTimeMillis() - 60000).setRefreshToken("refresh-old").build(), null);
            session.authorize(state, session.generation());
            provider.enqueue(new MockResponse().setHeader("Content-Type", "application/json")
                .setBody("{\"access_token\":\"fresh\",\"token_type\":\"Bearer\",\"expires_in\":3600,\"refresh_token\":\"rotated\"}")
                .setBodyDelay(250, TimeUnit.MILLISECONDS));
            CountDownLatch latch = new CountDownLatch(2);
            AtomicReference<Exception> failure = new AtomicReference<>();
            NativeSession.TokenResult callback = (token, error) -> {
                if (error != null) failure.set(error);
                if (!"fresh".equals(token)) failure.set(new IllegalStateException("Wrong token"));
                latch.countDown();
            };
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { session.token(callback); session.token(callback); });
            assertTrue(latch.await(15, TimeUnit.SECONDS)); assertNull(failure.get()); assertEquals(1, provider.getRequestCount());
            assertTrue(new SecureStore(context).read().contains("rotated"));
            state.setNeedsTokenRefresh(true);
            provider.enqueue(new MockResponse().setResponseCode(503).setBody("temporarily unavailable"));
            assertNotNull(requestToken(session));
            assertTrue("A transient failure must retain the session", session.authenticated());
            provider.enqueue(new MockResponse().setHeader("Content-Type", "application/json")
                .setBody("{\"access_token\":\"recovered\",\"token_type\":\"Bearer\",\"expires_in\":3600}"));
            assertNull(requestToken(session));
            state.setNeedsTokenRefresh(true);
            provider.enqueue(new MockResponse().setResponseCode(400).setHeader("Content-Type", "application/json").setBody("{\"error\":\"invalid_grant\"}"));
            assertNotNull(requestToken(session));
            assertFalse("An invalid refresh grant must clear credentials", session.authenticated());
            session.signOut(false); assertFalse(session.authenticated()); assertEquals("https://notes.example", session.server());
            assertFalse(new SecureStore(context).read().contains("rotated"));
            session.signOut(true); assertNull(session.server());
        }
    }
    private Exception requestToken(NativeSession session) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<Exception> failure = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> session.token((token, error) -> { failure.set(error); latch.countDown(); }));
        assertTrue(latch.await(15, TimeUnit.SECONDS));
        return failure.get();
    }
}
