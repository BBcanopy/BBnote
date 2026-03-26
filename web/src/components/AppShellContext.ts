import { useOutletContext } from "react-router-dom";

export interface PageNavTitleControl {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange(value: string): void;
}

export interface AppShellOutletContext {
  setPageNavTitleControl(control: PageNavTitleControl | null): void;
}

export function useAppShellOutletContext() {
  return useOutletContext<AppShellOutletContext>();
}
