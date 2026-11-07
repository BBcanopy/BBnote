import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { isNative, openExternal } from "./native";

export function dismissNativeOverlay() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter((node) => node.getClientRects().length);
  const dialog = dialogs.at(-1);
  if (dialog) {
    const dismiss = dialog.querySelector<HTMLButtonElement>("[data-native-dismiss]");
    if (dismiss) dismiss.click(); else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    return true;
  }
  const menu = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"][aria-expanded="true"]');
  if (menu) { menu.click(); return true; }
  return false;
}

export function useNativeIntegration() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative()) return;
    const back = App.addListener("backButton", ({ canGoBack }) => {
      if (dismissNativeOverlay()) return;
      if (canGoBack) navigate(-1); else void App.minimizeApp();
    });
    const externalClick = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || event.defaultPrevented) return;
      const url = new URL(anchor.href);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.origin !== location.origin) {
        event.preventDefault(); void openExternal(url.href);
      }
    };
    document.addEventListener("click", externalClick);
    const theme = () => void SystemBars.setStyle({ style: document.documentElement.dataset.theme === "midnight" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    const observer = new MutationObserver(theme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    theme();
    return () => { void back.then((listener) => listener.remove()).catch(() => {}); observer.disconnect(); document.removeEventListener("click", externalClick); };
  }, [navigate]);
}
