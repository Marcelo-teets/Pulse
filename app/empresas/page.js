"use client";

import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export default function EmpresasPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ items: [], total: 0, connected: true });
  const [loading, setLoading] = useState(true);

  async function load(term = query) {
    setLoading(true);
    try {
      const response = await fetch("/api/companies?q=" + encodeURIComponent(term), { cache: "no-store" });
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, []);

  return (
    <PageShell
      title="Empresas"
      actions={<button className="ghost-button" onClick={() => load()}>{loading ? "Atualizando…" : "Atualizar"}</button>}
    >
      <section className="section-intro">
        <div>
          <p className="eyebrow">ACCOUNT INTELLIGENCE</p>
          <h2>Empresas identificadas</h2>
          <p>Companhias associadas aos cargos atuais dos perfis capturados, consolidadas por empresa e prontas para enriquecimento.</p>
        </div>
        <div className="big-counter">
          <span>Total</span>
          <strong>{data.total ?? 0}</strong>
        </div>
      </section>

      <article className="panel">
        <div className="panel-header people-toolbar">
          <div>
            <p className="eyebrow">BASE</p>
            <h3>Empresas mapeadas</h3>
          </div>
          <form className="search-box wide" onSubmit={(event) => { event.preventDefault(); load(query); }}>
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por empresa, site, descrição ou headcount" />
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Headcount</th>
                <th>Pessoas</th>
                <th>Website</th>
                <th>Última captura</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length ? data.items.map((company) => (
                <tr key={company.id}>
                  <td>
                    <div className="person-cell">
                      <div className="avatar">{company.company_name?.[0]?.toUpperCase() || "?"}</div>
                      <div>
                        <b>{company.company_name}</b>
                        <small>{company.description || company.company_key}</small>
                      </div>
                    </div>
                  </td>
                  <td>{company.employee_count || "—"}</td>
                  <td>{company.people_count ?? 0}</td>
                  <td>
                    {company.website ? <a className="table-link" href={company.website} target="_blank" rel="noreferrer">{company.website} ↗</a> : "—"}
                  </td>
                  <td>{formatDate(company.last_seen_at)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">
                      <div className="empty-icon">▦</div>
                      <b>{loading ? "Carregando…" : "Nenhuma empresa encontrada"}</b>
                      <p>{data.message || "As empresas relacionadas aos perfis capturados aparecerão aqui."}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </PageShell>
  );
}
