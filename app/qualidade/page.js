"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "../components/PageShell";

const PAGE_SIZE = 25;
const stateLabels = { ready: "Completa", review: "Revisar identidade", blocked: "Conflito" };
const reviewLabels = { pending: "Pendente", approved: "Aprovada", rejected: "Rejeitada" };

export default function QualityPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (target = 1) => {
    setError("");
    try {
      const response = await fetch("/api/quality?page=" + target + "&limit=" + PAGE_SIZE, { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/auth"; return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Falha ao carregar revisões.");
      setData({ items: Array.isArray(payload.items) ? payload.items : [], total: Number(payload.total || 0) });
      setPage(target);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function review(item, status) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/quality", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ capture_id: item.capture_id, status, note }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar revisão.");
      setSelected(""); setNote(""); await load(page);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <PageShell title="Qualidade dos dados" actions={<button type="button" className="ghost-button" onClick={() => load(page)}>Atualizar</button>}>
      <section className="section-intro">
        <div><p className="eyebrow">QUALITY & IDENTITY</p><h2>Central de revisão</h2>
          <p>Completude não significa precisão. Confira o perfil e a página da empresa antes de aprovar uma captura.</p>
        </div>
        <div className="big-counter"><span>Capturas</span><strong>{data.total}</strong></div>
      </section>
      {error && <div className="panel" role="alert" style={{ padding: 18, marginBottom: 16, color: "#ffb3b3" }}>{error}</div>}
      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">AUDITORIA HUMANA</p><h3>Capturas recentes</h3></div></div>
        <div className="table-wrap"><table><thead><tr>
          <th>Profissional</th><th>Empresa observada</th><th>Completude</th><th>Identidade</th><th>Revisão</th><th>Ação</th>
        </tr></thead><tbody>
          {data.items.length ? data.items.map((item) => (
            <tr key={item.capture_id}>
              <td><a href={item.linkedin_url} target="_blank" rel="noreferrer">{item.full_name || "—"}</a><small>{item.current_title || "—"}</small></td>
              <td><b>{item.current_company || "—"}</b><small>{item.company_name || "Página não disponível"}</small>
                {item.company_linkedin_url && <small><a href={item.company_linkedin_url} target="_blank" rel="noreferrer">Página da empresa ↗</a></small>}</td>
              <td>{item.assessment.completeness}%</td>
              <td>{stateLabels[item.assessment.state] || "—"}
                <small>{item.assessment.issues.join(" · ") || "Sem alertas automáticos"}</small>
                <small>{item.assessment.identity_confidence == null ? "Confiança não informada" : "Confiança reportada: " + item.assessment.identity_confidence + "%"}</small>
              </td>
              <td>{reviewLabels[item.review_status] || "Pendente"}</td>
              <td><button type="button" className="ghost-button" onClick={() => {
                setSelected(selected === item.capture_id ? "" : item.capture_id); setNote(item.review_note || "");
              }}>Revisar</button></td>
            </tr>
          )) : <tr><td colSpan="6"><div className="empty-state"><b>Sem capturas nesta página</b><p>Capturas novas aparecerão automaticamente.</p></div></td></tr>}
        </tbody></table></div>
        {data.items.filter((item) => item.capture_id === selected).map((item) => (
          <section key={item.capture_id} style={{ padding: 22, borderTop: "1px solid #334155" }}>
            <h3>Revisar: {item.full_name}</h3>
            <p>Fontes reportadas: {JSON.stringify(item.assessment.provenance)}. Marcar como aprovada não altera os dados canônicos.</p>
            <textarea rows={3} aria-label="Nota de revisão" value={note} onChange={(event) => setNote(event.target.value)}
              placeholder="Registre evidências ou o motivo da rejeição" style={{ width: "100%", marginBottom: 12 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button className="ghost-button" type="button" disabled={busy} onClick={() => review(item, "approved")}>Aprovar revisão</button>
              <button className="ghost-button" type="button" disabled={busy} onClick={() => review(item, "rejected")}>Rejeitar com justificativa</button>
              <button className="ghost-button" type="button" disabled={busy} onClick={() => review(item, "pending")}>Reabrir</button>
            </div>
          </section>
        ))}
        {data.total > PAGE_SIZE && <div style={{ display: "flex", justifyContent: "space-between", padding: 20 }}>
          <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => load(page - 1)}>Anterior</button>
          <span>Página {page} de {Math.ceil(data.total / PAGE_SIZE)}</span>
          <button type="button" className="ghost-button" disabled={page * PAGE_SIZE >= data.total} onClick={() => load(page + 1)}>Próxima</button>
        </div>}
      </article>
    </PageShell>
  );
}
