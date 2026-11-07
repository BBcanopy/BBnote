package me.jybb.bbnote;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

final class SecureStore {
    private static final String ALIAS = "bbnote.native.session.v1";
    private final SharedPreferences preferences;
    SecureStore(Context context) { preferences = context.getSharedPreferences("native-auth", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    String read() throws Exception {
        String encoded = preferences.getString("payload", null);
        if (encoded == null) return "{}";
        byte[] payload = Base64.decode(encoded, Base64.NO_WRAP);
        if (payload.length < 13) throw new IllegalStateException("Invalid encrypted session");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, payload, 0, 12));
        return new String(cipher.doFinal(payload, 12, payload.length - 12), StandardCharsets.UTF_8);
    }
    void write(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] body = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] payload = new byte[cipher.getIV().length + body.length];
        System.arraycopy(cipher.getIV(), 0, payload, 0, cipher.getIV().length);
        System.arraycopy(body, 0, payload, cipher.getIV().length, body.length);
        if (!preferences.edit().putString("payload", Base64.encodeToString(payload, Base64.NO_WRAP)).commit()) {
            throw new IllegalStateException("Could not save the encrypted session.");
        }
    }
    void clear() {
        if (!preferences.edit().clear().commit()) throw new IllegalStateException("Could not clear the session.");
    }
}
