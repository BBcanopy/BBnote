package me.jybb.bbnote;

import java.net.URI;
import java.util.Arrays;

final class UrlPolicy {
    private UrlPolicy() {}
    static URI endpoint(String value, boolean debug) {
        URI uri = URI.create(value);
        boolean local = Arrays.asList("localhost", "127.0.0.1", "10.0.2.2").contains(uri.getHost() == null ? "" : uri.getHost());
        if (uri.getHost() == null || uri.getRawUserInfo() != null || uri.getFragment() != null
            || !("https".equals(uri.getScheme()) || (debug && local && "http".equals(uri.getScheme())))) {
            throw new IllegalArgumentException("Use an HTTPS server URL.");
        }
        return uri;
    }
    static String origin(String value, boolean debug) {
        URI uri = endpoint(value, debug);
        if (uri.getQuery() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
            throw new IllegalArgumentException("Enter the server origin without a path or query.");
        }
        return uri.getScheme() + "://" + uri.getRawAuthority();
    }
    static URI download(String value, String server, boolean debug) {
        URI uri = endpoint(value, debug);
        if (server == null || !server.equals(uri.getScheme() + "://" + uri.getRawAuthority())
            || !uri.getPath().startsWith("/api/v1/") || !uri.normalize().getPath().startsWith("/api/v1/")) {
            throw new IllegalArgumentException("Download must belong to the selected BBNote server.");
        }
        return uri;
    }
}
