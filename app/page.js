"use client";

import { useEffect, useMemo, useState } from "react";

const navItems = [
  ["Visão geral", "⌁", "/"],
  ["Pessoas", "◎", "/pessoas"],
  ["Empresas", "▦", "/empresas"],
  ["Sincronização", "↻", "/sincronizacao"],
  ["Operação", "◫", "/operacao"],
  ["Configuração", "⚙", "/configuracao"],
  ["Usuários", "◇", "/usuarios", "master"],
];

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function Metric({ label, value, hint, accent }) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span>{label}</span>
        <i className={accent ? "metric-dot accent" : "metric-dot"} />
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function StatusPill({ status }) {
  const normalized = (status || "idle").toLowerCase();
  const labels = {
    synced: "Sincronizado",
    pending: "Pendente",
    processing: "Processando",
    error: "Erro",
    idle: "Pronto",
  };
  return <span className={"status-pill " + normalized}>{labels[normalized] || status}</span>;
}

export default function Home() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState("Visão geral");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      setData(payload);
    } catch {
      setData({
        connected: false,
        stats: {},
        people: [],
        companies: [],
        queue: [],
        message: "Não foi possível consultar o backend.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setUser(payload.user || null))
      .catch(() => setUser(null));
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  const filteredPeople = useMemo(() => {
    const items = data?.people || [];
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.full_name, item.current_title, item.company_name, item.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [data, query]);

  const stats = data?.stats || {};

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
              key={label}
              href={href}
              onClick={() => setActive(label)}
              className={active === label ? "nav-item active" : "nav-item"}
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
              <b>{user?.fullName || "Infra online"}</b>
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
            <p className="eyebrow">PULSE CONTROL CENTER</p>
            <h1>{active}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={refresh}>
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
            <a className="primary-button" href="https://www.linkedin.com" target="_blank" rel="noreferrer">
              Abrir LinkedIn ↗
            </a>
          </div>
        </header>

        <div className="content">
          <section className="hero-panel">
            <div>
              <span className="system-kicker">
                <i className={data?.connected ? "live-dot" : "live-dot warning"} />
                {data?.connected ? "Neon conectado" : "Frontend operacional"}
              </span>
              <h2>Inteligência comercial, da captura ao dado utilizável.</h2>
              <p>
                Acompanhe pessoas, empresas e sincronizações capturadas pela extensão do LinkedIn
                em uma única camada operacional.
              </p>
            </div>
            <div className="hero-status">
              <span>Última atualização</span>
              <strong>{formatDate(data?.generatedAt)}</strong>
              <small>{data?.message || "Atualização automática a cada 30 segundos."}</small>
            </div>
          </section>

          <section className="metrics-grid">
            <Metric label="Pessoas" value={stats.people ?? 0} hint="perfis únicos" accent />
            <Metric label="Empresas" value={stats.companies ?? 0} hint="companhias mapeadas" />
            <Metric label="Capturas" value={stats.profileCaptures ?? 0} hint="eventos de pessoa" />
            <Metric label="Fila Sheets" value={stats.pendingSync ?? 0} hint="itens pendentes" />
          </section>

          <section className="two-column">
            <article className="panel main-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">CAPTURAS</p>
                  <h3>Pessoas recentes</h3>
                </div>
                <label className="search-box">
                  <span>⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar pessoa, empresa ou cargo"
                  />
                </label>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Cargo / empresa</th>
                      <th>Localização</th>
                      <th>Captura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.length > 0 ? (
                      filteredPeople.map((person) => (
                        <tr key={person.id || person.linkedin_url}>
                          <td>
                            <div className="person-cell">
                              <div className="avatar">
                                {(person.full_name || "?")
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((part) => part[0])
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <div>
                                <a href={person.linkedin_url} target="_blank" rel="noreferrer">
                                  {person.full_name}
                                </a>
                                <small>{person.employee_count || "perfil capturado"}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <b>{person.current_title || "Cargo não informado"}</b>
                            <small>{person.company_name || person.current_company || "Empresa não informada"}</small>
                          </td>
                          <td>{person.location || "—"}</td>
                          <td>{formatDate(person.last_seen_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">
                          <div className="empty-state">
                            <div className="empty-icon">◎</div>
                            <b>Nenhuma captura disponível ainda</b>
                            <p>
                              Assim que a extensão enviar o primeiro perfil, ele aparecerá aqui automaticamente.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <aside className="stack">
              <article className="panel">
                <div className="panel-header compact">
                  <div>
                    <p className="eyebrow">PIPELINE</p>
                    <h3>Status operacional</h3>
                  </div>
                </div>

                <div className="pipeline">
                  <div className="pipeline-row">
                    <span><i className="node active-node" />Extensão Chrome</span>
                    <StatusPill status="idle" />
                  </div>
                  <div className="connector-line" />
                  <div className="pipeline-row">
                    <span><i className={data?.connected ? "node active-node" : "node"} />Neon / Postgres</span>
                    <StatusPill status={data?.connected ? "synced" : "pending"} />
                  </div>
                  <div className="connector-line" />
                  <div className="pipeline-row">
                    <span><i className="node active-node" />Google Sheets</span>
                    <StatusPill status={stats.pendingSync > 0 ? "pending" : "synced"} />
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header compact">
                  <div>
                    <p className="eyebrow">EMPRESAS</p>
                    <h3>Últimas mapeadas</h3>
                  </div>
                </div>
                <div className="company-list">
                  {(data?.companies || []).length > 0 ? (
                    data.companies.slice(0, 5).map((company) => (
                      <div className="company-item" key={company.id || company.company_key}>
                        <div className="company-logo">{(company.company_name || "?")[0]}</div>
                        <div>
                          <b>{company.company_name}</b>
                          <span>{company.employee_count || "Headcount não informado"}</span>
                        </div>
                        {company.website ? (
                          <a href={company.website} target="_blank" rel="noreferrer">↗</a>
                        ) : <span>—</span>}
                      </div>
                    ))
                  ) : (
                    <div className="mini-empty">
                      <span>▦</span>
                      <p>Empresas aparecerão aqui após as capturas.</p>
                    </div>
                  )}
                </div>
              </article>
            </aside>
          </section>

          <section className="bottom-grid">
            <article className="panel architecture-card">
              <div>
                <p className="eyebrow">ARQUITETURA</p>
                <h3>Fluxo de dados</h3>
                <p>LinkedIn → Extensão → Neon Function → Postgres → Fila → Google Sheets</p>
              </div>
              <div className="architecture-nodes">
                {["LI", "EXT", "DB", "Q", "GS"].map((node, index) => (
                  <span key={node}>
                    <i>{node}</i>
                    {index < 4 && <em>→</em>}
                  </span>
                ))}
              </div>
            </article>

            <article className="panel sync-card">
              <div>
                <p className="eyebrow">SYNC</p>
                <h3>Fila de sincronização</h3>
              </div>
              <div className="sync-numbers">
                <div><strong>{stats.synced ?? 0}</strong><span>sincronizados</span></div>
                <div><strong>{stats.processing ?? 0}</strong><span>processando</span></div>
                <div><strong>{stats.errors ?? 0}</strong><span>com erro</span></div>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
