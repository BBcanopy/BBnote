import { SignIn } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

export function AuthSplash(props: { onLogin(): void; busy: boolean }) {
  return (
    <section className="grid min-h-[100dvh] place-items-center px-4 py-8">
      <article className="w-full max-w-[34rem] rounded-[2rem] border border-black/6 bg-white/88 px-8 py-10 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:px-10">
        <div className="flex justify-center">
          <span
            aria-hidden="true"
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-emerald-900 px-3 font-['Geist_Mono'] text-sm font-medium uppercase tracking-[0.18em] text-[#f3efe8]"
          >
            bb
          </span>
        </div>
        <h1 className="mt-6 text-center text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">BBNote</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
          Markdown in files. Metadata in SQLite.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={props.onLogin}
            disabled={props.busy}
            className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-emerald-900 px-5 text-sm font-medium text-[#f7f3ec] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-emerald-800 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SignIn size={18} weight="bold" />
            {props.busy ? "Preparing sign-in" : "Sign in with OIDC"}
          </button>
          <Link
            to="/docs"
            className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950 active:translate-y-0 active:scale-[0.98]"
          >
            Read API docs
          </Link>
        </div>
      </article>
    </section>
  );
}
