export const buttonBase =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export const buttonPrimary = `${buttonBase} bg-emerald-700 text-white shadow-[0_18px_36px_-24px_rgba(4,120,87,0.9)] hover:-translate-y-[1px] hover:bg-emerald-600`;

export const buttonSecondary = `${buttonBase} border border-slate-200 bg-white text-slate-700 hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950`;

export const buttonGhost = `${buttonBase} bg-slate-100/85 text-slate-700 hover:-translate-y-[1px] hover:bg-white hover:text-slate-950`;

export const buttonDanger = `${buttonBase} border border-red-200 bg-red-50 text-red-700 hover:-translate-y-[1px] hover:border-red-300 hover:bg-red-100`;
