import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ style: vi.fn().mockResolvedValue(undefined), listener: vi.fn().mockResolvedValue({ remove: vi.fn() }) }));
vi.mock("@capacitor/core", () => ({ SystemBars: { setStyle: mocks.style }, SystemBarsStyle: { Dark: "DARK", Light: "LIGHT" } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: mocks.listener } }));
vi.mock("./native", () => ({ isNative: () => true, openExternal: vi.fn() }));
import { useNativeIntegration } from "./NativeIntegration";

afterEach(() => { delete document.documentElement.dataset.theme; mocks.style.mockClear(); });
it("keeps native system-bar icons readable as the app theme changes", async () => {
  function Probe() { useNativeIntegration(); return null; }
  document.documentElement.dataset.theme = "sea";
  render(<MemoryRouter><Probe /></MemoryRouter>);
  await waitFor(() => expect(mocks.style).toHaveBeenLastCalledWith({ style: "LIGHT" }));
  document.documentElement.dataset.theme = "midnight";
  await waitFor(() => expect(mocks.style).toHaveBeenLastCalledWith({ style: "DARK" }));
});
