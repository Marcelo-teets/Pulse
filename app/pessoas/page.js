"use client";

import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export default function PessoasPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ items: [], total: 0, connected: true });
  const [loading, setLoading] = useState(true);

  async function load(term = query) {
    setLoading(true);
    try {
      const response = await fetch("/api/people?q=" + encodeURIComponent(term), { cache: "no-store" });
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, []);

  return (
    <PageShell
      title="Pessoas"
      actions={<button className="ghost-button" onClick={() => load()}>{loading ? "Atualizando…" : "Atualizar"}</button>}
    >
      <section className="section-intro">
        <div>
          <p className="eyebrow">LINKEDIN INTELLIGENCE</p>
          <h2>Perfis capturados</h2>
          <p>Base deduplicada de profissionais capturados pela extensão, com vínculo à empresa atual e histórico de atualização.</p>
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
            <h3>Pessoas mapeadas</h3>
          </div>
          <form className="search-box wide" onSubmit={(event) => { event.preventDefault(); load(query); }}>
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, cargo, empresa ou localização" />
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Cargo</th>
                <th>Empresa</th>
                <th>Localização</th>
                <th>Última captura</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length ? data.items.map((person) => (
                <tr key={person.id}>
                  <td>
                    <div className="person-cell">
                      <div className="avatar">{person.full_name.split(" ").slice(0,2).map((p) => p[0]).join("").toUpperCase()}</div>
                      <div>
                        <a href={person.linkedin_url} target="_blank" rel="noreferrer">{person.full_name}</a>
                        <small>{person.linkedin_url}</small>
                      </div>
                    </div>
                  </td>
                  <td>{person.current_title || "—"}</td>
                  <td>
                    <b>{person.company_name || person.current_company || "—"}</b>
                    <small>{person.employee_count || ""}</small>
                  </td>
                  <td>{person.location || "—"}</td>
                  <td>{formatDate(person.last_seen_at)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">
                      <div className="empty-icon">◎</div>
                      <b>{loading ? "Carregando…" : "Nenhuma pessoa encontrada"}</b>
                      <p>{data.message || "Os perfis capturados aparecerão aqui."}</p>
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
