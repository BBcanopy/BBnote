import type { UserTheme } from "../api/types";

export const defaultTheme: UserTheme = "sea";

export const themeOptions: Array<{
  id: UserTheme;
  label: string;
  description: string;
}> = [
  {
    id: "sea",
    label: "Sea",
    description: "Cool glass, mineral greens, and a bright work surface."
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm paper tones with copper accents."
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Dark studio contrast with teal highlights."
  }
];
