import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <main className="min-h-[100dvh] bg-canvas text-slate-950">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col px-4 py-6 md:px-8">
        <Outlet />
      </div>
    </main>
  );
}

