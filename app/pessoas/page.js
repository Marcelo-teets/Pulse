"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function displayName(person) {
  const direct = (person?.full_name || "").trim();
  if (direct) return direct;
  try {
    const slug = new URL(person?.linkedin_url || "").pathname.split("/in/")[1]?.split("/")[0] || "";
    return slug ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Perfil LinkedIn";
  } catch {
    return "Perfil LinkedIn";
  }
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0,2).map((part) => part[0]).join("").toUpperCase() || "?";
}

const PAGE_SIZE = 50;

export default function PessoasPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, connected: true });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (term = "", nextPage = 1) => {
    setLoading(true);
    try {
      const response = await fetch("/api/people?q=" + encodeURIComponent(term) + "&limit=" + PAGE_SIZE + "&page=" + nextPage, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setData({ items: [], total: 0, connected: false, message: payload.message || payload.error || "Falha ao consultar pessoas." });
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
      setData({ items: [], total: 0, connected: false, message: "Não foi possível consultar pessoas." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load("", 1); }, [load]);

  return (
    <PageShell
      title="Pessoas"
      actions={<button type="button" className="ghost-button" onClick={() => load(query, page)}>{loading ? "Atualizando…" : "Atualizar"}</button>}
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
          <form className="search-box wide" onSubmit={(event) => { event.preventDefault(); load(query, 1); }}>
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
                      <div className="avatar">{initials(displayName(person))}</div>
                      <div>
                        <a href={person.linkedin_url} target="_blank" rel="noreferrer">{displayName(person)}</a>
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
