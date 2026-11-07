import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ native: true, token: vi.fn(), connect: vi.fn(), download: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mock.native }, registerPlugin: () => ({ getAccessToken: mock.token, connect: mock.connect, download: mock.download }) }));
import { apiFetch, apiUrl, assertActiveResponse, connectNativeServer, nativeDownload, normalizeServerUrl, setNativeServer } from "./native";

beforeEach(() => { mock.native = true; mock.token.mockReset().mockResolvedValue({ token: "access" }); mock.connect.mockReset(); mock.download.mockReset(); setNativeServer("https://notes.example.com"); });
afterEach(() => vi.unstubAllGlobals());
describe("native transport", () => {
  it.each(["http://notes.example.com", "https://user:pass@notes.example.com", "https://notes.example.com/path", "https://notes.example.com/?token=oops", "file:///notes", "javascript:alert(1)"])("rejects unsafe server %s", (value) => expect(() => normalizeServerUrl(value)).toThrow());
  it("normalizes origins and restricts debug HTTP to development hosts", () => {
    expect(normalizeServerUrl(" https://Notes.example.com/ ")).toBe("https://notes.example.com");
    expect(normalizeServerUrl("http://10.0.2.2:8082", true)).toBe("http://10.0.2.2:8082");
    expect(() => normalizeServerUrl("http://192.168.1.10", true)).toThrow();
    expect(() => normalizeServerUrl("http://localhost")).toThrow();
  });
  it("uses a bearer token without cookies and preserves multipart bodies", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetcher);
    const body = new FormData(); body.set("file", new Blob(["note"]), "note.txt");
    await apiFetch("/api/v1/notes/n/attachments", { method: "POST", body });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://notes.example.com/api/v1/notes/n/attachments");
    expect(options.credentials).toBe("omit"); expect(options.redirect).toBe("error");
    expect(options.headers.get("Authorization")).toBe("Bearer access"); expect(options.headers.has("Content-Type")).toBe(false);
    expect(options.body).toBe(body);
  });
  it("refuses foreign origins before obtaining a token or making a request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(apiFetch("https://evil.example/api/v1/notes")).rejects.toThrow("outside");
    expect(mock.token).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(() => apiUrl("//evil.example/api/v1/notes")).toThrow();
  });
  it("aborts in-flight work and rejects stale responses after changing servers", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const request = apiFetch("/api/v1/notes"); await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    setNativeServer("https://other.example.com"); finish(new Response("[]"));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    fetcher.mockResolvedValue(new Response("{}"));
    const response = await apiFetch("/api/v1/notes"); setNativeServer(null);
    expect(() => assertActiveResponse(response)).toThrow();
  });
  it("does not leak a token obtained while the server was being switched", async () => {
    let finish!: (value: { token: string }) => void;
    mock.token.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const request = apiFetch("/api/v1/notes"); setNativeServer(null); finish({ token: "old" });
    await expect(request).rejects.toMatchObject({ name: "AbortError" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps existing browser authentication unchanged", async () => {
    mock.native = false; const fetcher = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetcher);
    await apiFetch("/api/v1/notes"); expect(fetcher).toHaveBeenCalledWith("/api/v1/notes", { credentials: "same-origin" });
    expect(mock.token).not.toHaveBeenCalled();
  });
  it("does not expire a new session because an old token request failed", async () => {
    let rejectToken!: (failure: unknown) => void;
    mock.token.mockImplementation(() => new Promise((resolve, reject) => { rejectToken = reject; }));
    const expired = vi.fn();
    window.addEventListener("bbnote:auth-required", expired);
    try {
      const request = apiFetch("/api/v1/notes");
      setNativeServer("https://other.example.com");
      rejectToken({ code: "AUTH_REQUIRED" });
      await expect(request).rejects.toMatchObject({ name: "AbortError" });
      expect(expired).not.toHaveBeenCalled();
    } finally { window.removeEventListener("bbnote:auth-required", expired); }
  });
  it("connects using public config and invokes the native download adapter", async () => {
    const config = { issuer: "https://issuer.example.com/realm", clientId: "android", scopes: ["openid"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(config)));
    await connectNativeServer("https://new.example.com/", false);
    expect(mock.connect).toHaveBeenCalledWith({ server: "https://new.example.com", config });
    await nativeDownload("/api/v1/attachments/a", "note.pdf", true);
    expect(mock.download).toHaveBeenCalledWith({ url: "https://new.example.com/api/v1/attachments/a", name: "note.pdf", open: true });
  });
});
