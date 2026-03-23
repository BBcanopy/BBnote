import { Link } from "react-router-dom";

const publicEndpoints = ["GET /healthz", "GET /api/v1/auth/session", "GET /api/v1/auth/login", "GET /auth/callback"];
const notebookEndpoints = [
  "GET /api/v1/folders",
  "POST /api/v1/folders",
  "GET /api/v1/notes",
  "POST /api/v1/notes",
  "PUT /api/v1/notes/:id",
  "DELETE /api/v1/notes/:id"
];
const dataEndpoints = [
  "POST /api/v1/notes/:id/attachments",
  "DELETE /api/v1/attachments/:id",
  "POST /api/v1/imports",
  "GET /api/v1/imports/:id",
  "POST /api/v1/exports",
  "GET /api/v1/exports/:id/download"
];

export function DocsPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f3efe8] px-4 py-8 text-slate-950">
      <section className="mx-auto w-full max-w-[62rem]">
        <div className="rounded-[2rem] border border-black/6 bg-white/88 p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-emerald-900 px-3 font-['Geist_Mono'] text-xs font-medium uppercase tracking-[0.18em] text-[#f3efe8]">
                bb
              </span>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">API docs</h1>
              <p className="mt-3 max-w-[46rem] text-sm leading-relaxed text-slate-600">
                BBNote keeps the server surface lean: OIDC session auth, notebook and note CRUD, attachments, imports,
                exports, and one health endpoint.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950 active:translate-y-0 active:scale-[0.98]"
            >
              Back to sign-in
            </Link>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr_1fr]">
            <EndpointGroup title="Public" items={publicEndpoints} />
            <EndpointGroup title="Notebook workspace" items={notebookEndpoints} />
            <EndpointGroup title="Import and export" items={dataEndpoints} />
          </div>
        </div>
      </section>
    </main>
  );
}

function EndpointGroup(props: { title: string; items: string[] }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50/75 p-5">
      <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.24em] text-slate-500">{props.title}</p>
      <ul className="mt-4 space-y-3">
        {props.items.map((item) => (
          <li key={item} className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3 font-['Geist_Mono'] text-xs text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
