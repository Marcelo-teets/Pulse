"use client";

import { usePathname } from "next/navigation";

const navItems = [
  ["Visão geral", "⌁", "/"],
  ["Pessoas", "◎", "/pessoas"],
  ["Empresas", "▦", "/empresas"],
  ["Sincronização", "↻", "/sincronizacao"],
];

export default function PageShell({ title, eyebrow = "PULSE CONTROL CENTER", actions, children }) {
  const pathname = usePathname();

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
          {navItems.map(([label, icon, href]) => (
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
              <b>Infra online</b>
              <small>Vercel + Neon</small>
            </div>
          </div>
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
