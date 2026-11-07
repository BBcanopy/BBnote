package me.jybb.bbnote;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BBNoteNative")
public class BBNoteNativePlugin extends Plugin {
    private NativeSession session;
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private volatile File pendingFile;
    private volatile boolean downloading;
    private volatile boolean signingIn;
    private int downloadGeneration;
    @Override public void load() { session = NativeSession.get(getContext()); }
    @PluginMethod public void getState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("server", session.server() == null ? org.json.JSONObject.NULL : session.server());
        result.put("debug", BuildConfig.DEBUG); result.put("authenticated", session.authenticated()); call.resolve(result);
    }
    @PluginMethod public void connect(PluginCall call) {
        try { session.configure(call.getString("server"), call.getObject("config")); call.resolve(); }
        catch (Exception failure) { call.reject("Could not save server settings.", failure); }
    }
    @PluginMethod public void signIn(PluginCall call) {
        if (signingIn) { call.reject("Sign-in is already open."); return; }
        signingIn = true;
        startActivityForResult(call, new Intent(getActivity(), NativeAuthActivity.class).putExtra("generation", session.generation()), "signedIn");
    }
    @ActivityCallback private void signedIn(PluginCall call, ActivityResult result) {
        signingIn = false;
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK && session.authenticated()) call.resolve();
        else call.reject(result.getData() == null ? "Sign-in cancelled." : result.getData().getStringExtra("error"));
    }
    @PluginMethod public void getAccessToken(PluginCall call) {
        session.token((token, error) -> {
            if (error != null) { call.reject(session.authenticated() ? "Connection failed. Please retry." : "Your session expired. Sign in again.",
                session.authenticated() ? "CONNECTION_FAILED" : "AUTH_REQUIRED"); return; }
            JSObject result = new JSObject(); result.put("token", token == null ? org.json.JSONObject.NULL : token); call.resolve(result);
        });
    }
    @PluginMethod public void signOut(PluginCall call) { clear(call, false); }
    @PluginMethod public void disconnect(PluginCall call) { clear(call, true); }
    private void clear(PluginCall call, boolean disconnect) {
        try {
            session.signOut(disconnect); discardPending();
            if (disconnect) getActivity().runOnUiThread(() -> { getBridge().getWebView().clearHistory(); call.resolve(); });
            else call.resolve();
        }
        catch (Exception failure) { call.reject("Could not clear the session.", failure); }
    }
    @PluginMethod public void download(PluginCall call) {
        if (downloading) { call.reject("Finish the current download first."); return; }
        final URI url;
        try { url = UrlPolicy.download(call.getString("url"), session.server(), BuildConfig.DEBUG); }
        catch (Exception failure) { call.reject(failure.getMessage()); return; }
        downloading = true;
        int version = session.generation();
        session.token((token, error) -> {
            if (error != null || token == null) { downloading = false; call.reject("Sign in again to download files."); return; }
            downloads.execute(() -> {
                File file = null;
                HttpURLConnection connection = null;
                try {
                    File directory = new File(getContext().getCacheDir(), "downloads");
                    if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Could not create download directory.");
                    String name = call.getString("name", "attachment").replaceAll("[\\\\/\\p{Cntrl}]", "_");
                    if (name.trim().isEmpty() || name.equals(".") || name.equals("..")) name = "attachment";
                    File transfer = File.createTempFile("bbnote-", ".part", directory); file = transfer;
                    connection = (HttpURLConnection) url.toURL().openConnection();
                    connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(60000);
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                    if (connection.getResponseCode() != 200) throw new IllegalStateException("Download failed. Check your connection and retry.");
                    String mime = connection.getContentType() == null ? "application/octet-stream" : connection.getContentType().split(";")[0];
                    try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(transfer)) { copy(input, output); }
                    if (version != session.generation()) throw new IllegalStateException("Server changed during download.");
                    final String filename = name;
                    getActivity().runOnUiThread(() -> {
                        try {
                            if (version != session.generation()) {
                                transfer.delete(); downloading = false; call.reject("Server changed during download."); return;
                            }
                            pendingFile = transfer; downloadGeneration = version;
                            if (Boolean.TRUE.equals(call.getBoolean("open", false))) {
                                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", transfer, filename);
                                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                getActivity().startActivity(view); downloading = false; pendingFile = null; call.resolve();
                            } else {
                                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                                    .setType(mime).putExtra(Intent.EXTRA_TITLE, filename);
                                startActivityForResult(call, save, "savedFile");
                            }
                        } catch (Exception failure) { discardPending(); call.reject("No app can open this file. Use Download to save it instead."); }
                    });
                } catch (Exception failure) {
                    if (file != null) file.delete(); downloading = false; call.reject(failure.getMessage());
                } finally { if (connection != null) connection.disconnect(); }
            });
        });
    }
    @ActivityCallback private void savedFile(PluginCall call, ActivityResult result) {
        File file = pendingFile;
        if (call == null || file == null) {
            discardPending();
            if (call != null) call.reject("Download interrupted. Please retry.");
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            discardPending(); call.resolve(); return;
        }
        Uri destination = result.getData().getData();
        int version = downloadGeneration;
        downloads.execute(() -> {
            try {
                if (version != session.generation()) throw new IllegalStateException("Server changed during download.");
                try (InputStream input = new java.io.FileInputStream(file); OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {
                    if (output == null) throw new IllegalStateException("Could not open the selected file.");
                    copy(input, output);
                }
                call.resolve();
            } catch (Exception failure) { call.reject("Could not save the file. Please retry."); }
            finally { discardPending(); }
        });
    }
    private void discardPending() { if (pendingFile != null) pendingFile.delete(); pendingFile = null; downloading = false; }
    private static void copy(InputStream input, OutputStream output) throws java.io.IOException {
        byte[] buffer = new byte[65536]; int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }
    @Override protected void handleOnDestroy() { downloads.shutdown(); }
}
