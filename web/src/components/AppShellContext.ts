import type { Dispatch, SetStateAction } from "react";
import { useOutletContext } from "react-router-dom";

export interface PageNavTitleControl {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange(value: string): void;
}

export interface PageNavTitleLayout {
  leftOffset: number;
  width: number;
}

export interface AppShellOutletContext {
  setPageNavTitleControl: Dispatch<SetStateAction<PageNavTitleControl | null>>;
  setPageNavTitleLayout: Dispatch<SetStateAction<PageNavTitleLayout | null>>;
}

export function useAppShellOutletContext() {
  return useOutletContext<AppShellOutletContext>();
}
