package me.jybb.bbnote;

import static org.junit.Assert.*;
import org.junit.Test;

public class UrlPolicyTest {
    @Test public void restrictsCleartextToLocalDebugHosts() {
        assertEquals("http://10.0.2.2:8082", UrlPolicy.origin("http://10.0.2.2:8082/", true));
        assertThrows(IllegalArgumentException.class, () -> UrlPolicy.origin("http://10.0.2.2:8082", false));
        assertThrows(IllegalArgumentException.class, () -> UrlPolicy.origin("http://192.168.1.1", true));
        assertThrows(IllegalArgumentException.class, () -> UrlPolicy.origin("https://user:pass@notes.example", false));
        assertThrows(IllegalArgumentException.class, () -> UrlPolicy.origin("https://notes.example/path", false));
    }
    @Test public void limitsAuthenticatedDownloadsToSelectedServerApi() {
        assertEquals("/api/v1/attachments/a", UrlPolicy.download("https://notes.example/api/v1/attachments/a", "https://notes.example", false).getPath());
        assertThrows(IllegalArgumentException.class, () -> UrlPolicy.download("https://evil.example/api/v1/attachments/a", "https://notes.example", false));
        assertThrows(IllegalArgumentException.class, () -> UrlPolicy.download("https://notes.example/api/v1/../../secret", "https://notes.example", false));
    }
}
