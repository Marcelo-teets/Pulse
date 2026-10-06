"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupEnabled, setSignupEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/signup", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setSignupEnabled(!!payload.signupEnabled))
      .catch(() => setSignupEnabled(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(payload.error || "Não foi possível continuar.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">P</div>
          <div>
            <b>Pulse</b>
            <span>Origination Intelligence</span>
          </div>
        </div>

        <div className="auth-copy">
          <p className="eyebrow">ACESSO SEGURO</p>
          <h1>{mode === "login" ? "Entrar no Pulse" : "Criar conta"}</h1>
          <p>
            Cada usuário tem sua própria base de capturas. O master acompanha tudo e gerencia os acessos.
          </p>
        </div>

        <div className="segmented-control">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">Entrar</button>
          {signupEnabled && (
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} type="button">Criar conta</button>
          )}
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Nome
              <input
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="voce@empresa.com"
              autoComplete="email"
              type="email"
            />
          </label>
          <label>
            Senha
            <input
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Mínimo 8 caracteres"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button auth-submit" disabled={loading}>
            {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </section>
    </main>
  );
}
