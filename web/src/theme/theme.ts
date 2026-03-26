import type { UserTheme } from "../api/types";

export const defaultTheme: UserTheme = "sea";

export const themeOptions: Array<{
  id: UserTheme;
  label: string;
}> = [
  {
    id: "sea",
    label: "Sea"
  },
  {
    id: "ember",
    label: "Ember"
  },
  {
    id: "midnight",
    label: "Midnight"
  }
];
