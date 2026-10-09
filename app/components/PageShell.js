"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  ["Visão geral", "⌁", "/"],
  ["Pessoas", "◎", "/pessoas"],
  ["Empresas", "▦", "/empresas"],
  ["Sincronização", "↻", "/sincronizacao"],
  ["Operação", "◫", "/operacao", "master"],
  ["Configuração", "⚙", "/configuracao"],
  ["Usuários", "◇", "/usuarios", "master"],
];

export default function PageShell({ title, eyebrow = "PULSE CONTROL CENTER", actions, children }) {
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.authenticated) {
          window.location.href = "/auth";
          return;
        }
        setUser(payload.user || null);
      })
      .catch(() => { window.location.href = "/auth"; });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth";
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <b>Pulse</b>
            <span>Origination Intelligence</span>
          </div>
        </div>

        <nav>
          {navItems.filter((item) => !item[3] || user?.role === item[3]).map(([label, icon, href]) => (
            <a
              key={href}
              href={href}
              className={pathname === href ? "nav-item active" : "nav-item"}
            >
              <span>{icon}</span>
              {label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="infra-badge">
            <span className="pulse-dot" />
            <div>
              <b>{user?.fullName || "Pulse"}</b>
              <small>{user?.role === "master" ? "master user" : user?.email || "Vercel + Neon"}</small>
            </div>
          </div>
          <button className="logout-button" onClick={logout}>Sair</button>
          <small>Pulse · produção</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            {actions}
            <a className="primary-button" href="https://www.linkedin.com" target="_blank" rel="noreferrer">
              Abrir LinkedIn ↗
            </a>
          </div>
        </header>
        <div className="content">{children}</div>
      </section>
    </main>
  );
}
