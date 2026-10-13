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
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [history, setHistory] = useState({ person_id: "", items: [], error: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, connected: true });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (term = "", nextPage = 1, job = "", place = "") => {
    setLoading(true);
    try {
      const response = await fetch("/api/people?q=" + encodeURIComponent(term) + "&limit=" + PAGE_SIZE + "&page=" + nextPage + "&role=" + encodeURIComponent(job) + "&location=" + encodeURIComponent(place), { cache: "no-store" });
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
      actions={<button type="button" className="ghost-button" onClick={() => load(query, page, role, location)}>{loading ? "Atualizando…" : "Atualizar"}</button>}
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

      <article className="panel" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label>Cargo <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">Todos</option><option value="CFO">CFO</option><option value="CEO">CEO</option>
            <option value="Founder">Founder</option><option value="Crédito">Crédito</option>
            <option value="Capital Markets">Capital Markets</option>
          </select></label>
          <label>Localização <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Ex.: Curitiba" /></label>
          <button type="button" className="ghost-button" onClick={() => load(query, 1, role, location)}>Filtrar</button>
          <a className="ghost-button" href={"/api/export?type=people&q=" + encodeURIComponent(query) + "&role=" + encodeURIComponent(role) + "&location=" + encodeURIComponent(location)}>Exportar CSV ↗</a>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header people-toolbar">
          <div>
            <p className="eyebrow">BASE</p>
            <h3>Pessoas mapeadas</h3>
          </div>
          <form className="search-box wide" onSubmit={(event) => { event.preventDefault(); load(query, 1, role, location); }}>
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
                <th>Última captura</th><th>Histórico</th>
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
                  <td><button type="button" className="ghost-button" onClick={async () => {
                    try {
                      const response = await fetch("/api/history?person_id=" + person.id);
                      const payload = await response.json();
                      if (!response.ok) throw new Error(payload.error || "Falha ao consultar histórico.");
                      setHistory({ person_id: String(person.id), items: payload.items || [], error: "" });
                    } catch (err) { setHistory({ person_id: String(person.id), items: [], error: err.message }); }
                  }}>Ver vínculos</button></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6">
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
            <button type="button" className="ghost-button" disabled={loading || page <= 1} onClick={() => load(query, page - 1, role, location)}>Anterior</button>
            <span aria-live="polite">Página {page} de {Math.ceil(data.total / PAGE_SIZE)}</span>
            <button type="button" className="ghost-button" disabled={loading || page * PAGE_SIZE >= data.total} onClick={() => load(query, page + 1, role, location)}>Próxima</button>
          </div>
        )}
      </article>
      {history.person_id && <article className="panel" style={{ padding: 20, marginTop: 20 }}>
        <h3>Histórico profissional</h3>
        {history.error && <p role="alert">{history.error}</p>}
        {!history.error && !history.items.length && <p>Nenhum histórico disponível.</p>}
        {history.items.map((item, index) => <p key={index}><b>{item.company_name}</b> — {item.current_title || "Cargo não informado"}
          <small>{formatDate(item.began_at)} até {item.ended_at ? formatDate(item.ended_at) : "atual"}</small></p>)}
        <button className="ghost-button" type="button" onClick={() => setHistory({ person_id: "", items: [], error: "" })}>Fechar</button>
      </article>}
    </PageShell>
  );
}
