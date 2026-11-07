import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

export interface NativeConfig { issuer: string; clientId: string; scopes: string[] }
export interface NativeState { server: string | null; debug: boolean; authenticated: boolean }
export interface NativeBridge {
  getState(): Promise<NativeState>;
  connect(options: { server: string; config: NativeConfig }): Promise<void>;
  signIn(): Promise<void>;
  getAccessToken(): Promise<{ token: string | null }>;
  signOut(): Promise<void>;
  disconnect(): Promise<void>;
  download(options: { url: string; name: string; open: boolean }): Promise<void>;
}

declare global { interface Window { __BBNOTE_NATIVE_TEST__?: NativeBridge } }
const plugin = registerPlugin<NativeBridge>("BBNoteNative");
// Only the dedicated development test server enables this hook; it is removed from APK/production builds.
const testBridge = () => import.meta.env.DEV && import.meta.env.VITE_NATIVE_TEST === "true"
  ? window.__BBNOTE_NATIVE_TEST__ : undefined;
export const isNative = () => Capacitor.isNativePlatform() || Boolean(testBridge());
export const nativeBridge = () => testBridge() ?? plugin;
let server: string | null = null;
let generation = 0;
let requests = new AbortController();
const responseGenerations = new WeakMap<Response, number>();
export const currentServer = () => server;

export function setNativeServer(value: string | null) {
  requests.abort(); requests = new AbortController(); generation += 1; server = value;
}

export function normalizeServerUrl(input: string, debug = false): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Enter a complete server URL, such as https://notes.example.com."); }
  const local = ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
  if (url.protocol !== "https:" && !(debug && local && url.protocol === "http:")) throw new Error("Use HTTPS for your BBNote server.");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Enter the server origin without a path, credentials, query, or fragment.");
  }
  return url.origin;
}

export function apiUrl(path: string): string {
  if (!isNative()) return path;
  if (!server) throw new Error("Connect to a BBNote server first.");
  const url = new URL(path, server);
  if (url.origin !== server || url.username || url.password || !url.pathname.startsWith("/api/v1/")) {
    throw new Error("Refusing to send credentials outside the selected BBNote server.");
  }
  return url.href;
}

export function assertActiveResponse(response: Response) {
  const version = responseGenerations.get(response);
  if (version !== undefined && version !== generation) throw new DOMException("Server changed", "AbortError");
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!isNative()) return fetch(path, { ...options, credentials: "same-origin" });
  const url = apiUrl(path);
  const version = generation;
  const signal = requests.signal;
  let token: string | null;
  try { ({ token } = await nativeBridge().getAccessToken()); }
  catch (failure) {
    if (version !== generation) throw new DOMException("Server changed", "AbortError");
    if ((failure as { code?: string }).code === "AUTH_REQUIRED") window.dispatchEvent(new Event("bbnote:auth-required"));
    throw failure;
  }
  if (version !== generation) throw new DOMException("Server changed", "AbortError");
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`); else headers.delete("Authorization");
  const response = await fetch(url, { ...options, headers, signal, credentials: "omit", redirect: "error" });
  if (version !== generation) throw new DOMException("Server changed", "AbortError");
  responseGenerations.set(response, version);
  if (response.status === 401) window.dispatchEvent(new Event("bbnote:auth-required"));
  return response;
}

export async function connectNativeServer(input: string, debug: boolean) {
  const origin = normalizeServerUrl(input, debug);
  const response = await fetch(`${origin}/api/v1/auth/native-config`, {
    credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error("Could not connect. Check the URL and update your BBNote server.");
  const config = await response.json() as NativeConfig;
  if (typeof config.issuer !== "string" || typeof config.clientId !== "string" || !config.clientId.trim()
    || !Array.isArray(config.scopes) || !config.scopes.every((scope) => typeof scope === "string")) {
    throw new Error("This server did not return valid Android sign-in settings.");
  }
  normalizeServerUrl(new URL(config.issuer).origin, debug);
  await nativeBridge().connect({ server: origin, config });
  setNativeServer(origin);
  return origin;
}

export async function openExternal(url: string) {
  if (isNative()) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Only web links can be opened externally.");
    if (testBridge()) { window.dispatchEvent(new CustomEvent("bbnote:test-external", { detail: url })); return; }
    await Browser.open({ url });
  } else window.open(url, "_blank", "noopener,noreferrer");
}

export async function nativeDownload(path: string, name: string, open = false) {
  await nativeBridge().download({ url: apiUrl(path), name, open });
}
