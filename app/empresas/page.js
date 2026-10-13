"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

const PAGE_SIZE = 50;

export default function EmpresasPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, connected: true });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (term = "", nextPage = 1) => {
    setLoading(true);
    try {
      const response = await fetch("/api/companies?q=" + encodeURIComponent(term) + "&limit=" + PAGE_SIZE + "&page=" + nextPage, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setData({ items: [], total: 0, connected: false, message: payload.message || payload.error || "Falha ao consultar empresas." });
        return;
      }
      setData({
        items: Array.isArray(payload.items) ? payload.items : [],
        total: Number(payload.total || 0),
        connected: payload.connected !== false,
        message: payload.message || "",
      });
      setPage(nextPage);
    } catch {
      setData({ items: [], total: 0, connected: false, message: "Não foi possível consultar empresas." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load("", 1); }, [load]);

  return (
    <PageShell
      title="Empresas"
      actions={<button type="button" className="ghost-button" onClick={() => load(query, page)}>{loading ? "Atualizando…" : "Atualizar"}</button>}
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

      <div style={{ marginBottom: 16 }}><a className="ghost-button" href={"/api/export?type=companies&q=" + encodeURIComponent(query)}>Exportar empresas em CSV ↗</a></div>

      <article className="panel">
        <div className="panel-header people-toolbar">
          <div>
            <p className="eyebrow">BASE</p>
            <h3>Empresas mapeadas</h3>
          </div>
          <form className="search-box wide" onSubmit={(event) => { event.preventDefault(); load(query, 1); }}>
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
                <th>Sinais DCM</th><th>Última captura</th>
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
                  <td><b>{company.signals?.score ?? 0}/100</b><small>{company.signals?.label || "Sem classificação"}</small><small>{(company.signals?.signals || []).join(" · ") || "Sem sinais textuais"}</small></td>
                  <td>{formatDate(company.last_seen_at)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6">
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
        {data.total > PAGE_SIZE && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 20px" }}>
            <button type="button" className="ghost-button" disabled={loading || page <= 1} onClick={() => load(query, page - 1)}>Anterior</button>
            <span aria-live="polite">Página {page} de {Math.ceil(data.total / PAGE_SIZE)}</span>
            <button type="button" className="ghost-button" disabled={loading || page * PAGE_SIZE >= data.total} onClick={() => load(query, page + 1)}>Próxima</button>
          </div>
        )}
      </article>
    </PageShell>
  );
}
