"use client";

import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export default function UsuariosPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "user" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/users", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/auth";
      return;
    }
    const payload = await response.json();
    setUsers(payload.users || []);
    setLoading(false);
  }

  async function createUser(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Falha ao criar usuário.");
      return;
    }
    setForm({ fullName: "", email: "", password: "", role: "user" });
    setMessage("Usuário criado com sucesso.");
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <PageShell title="Usuários">
      <section className="section-intro">
        <div>
          <p className="eyebrow">MASTER USER</p>
          <h2>Gestão de acessos</h2>
          <p>Crie usuários para outras pessoas usarem o Pulse com bases separadas. A visão master permanece global.</p>
        </div>
        <div className="big-counter">
          <span>Total</span>
          <strong>{users.length}</strong>
        </div>
      </section>

      <section className="two-column">
        <article className="panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">NOVO ACESSO</p>
              <h3>Criar usuário</h3>
            </div>
          </div>
          <form className="settings-form" onSubmit={createUser}>
            <label>Nome<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
            <label>E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Senha temporária<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
            <label>Perfil
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="user">Usuário</option>
                <option value="master">Master</option>
              </select>
            </label>
            {message && <div className="form-note">{message}</div>}
            <button className="primary-button">Criar usuário</button>
          </form>
        </article>

        <article className="panel main-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">BASE</p>
              <h3>Usuários ativos</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Último login</th></tr></thead>
              <tbody>
                {users.length ? users.map((item) => (
                  <tr key={item.id}>
                    <td><b>{item.fullName}</b><small>{item.email}</small></td>
                    <td>{item.role === "master" ? "Master" : "Usuário"}</td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.lastLoginAt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="4"><div className="empty-state"><b>{loading ? "Carregando..." : "Nenhum usuário encontrado"}</b></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </PageShell>
  );
}
