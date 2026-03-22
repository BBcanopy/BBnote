export function LoginCallbackPage() {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.18)]">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Authentication</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Completing sign-in</h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-slate-600">
        The OIDC callback handler will live here.
      </p>
    </section>
  );
}

