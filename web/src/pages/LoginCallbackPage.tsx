import { CircleNotch } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function LoginCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "ready") {
      return;
    }

    auth
      .completeLogin()
      .then(() => {
        navigate("/", { replace: true });
      })
      .catch((callbackError) => {
        setError(String(callbackError));
      });
  }, [auth, navigate]);

  return (
    <section className="grid min-h-[100dvh] place-items-center">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/60 bg-white/85 p-8 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Authentication</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Completing sign-in</h1>
        {error ? (
          <p className="mt-4 rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : (
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
            <CircleNotch size={18} className="animate-spin text-emerald-700" />
            Verifying the callback with your OIDC provider
          </div>
        )}
      </div>
    </section>
  );
}
