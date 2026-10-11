"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function StatusPill({ status }) {
  const normalized = (status || "pending").toLowerCase();
  const labels = { pending: "Pendente", processing: "Processando", synced: "Sincronizado", error: "Erro" };
  return <span className={"status-pill " + normalized}>{labels[normalized] || status}</span>;
}

export default function SyncPage() {
  const [status, setStatus] = useState("all");
  const [data, setData] = useState({
    items: [],
    stats: { total: 0, pending: 0, processing: 0, synced: 0, error: 0 },
    connected: true,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextStatus = "all") => {
    setLoading(true);
    try {
      const response = await fetch("/api/sync?status=" + encodeURIComponent(nextStatus), { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setData({
          items: [],
          stats: { total: 0, pending: 0, processing: 0, synced: 0, error: 0 },
          connected: false,
          message: payload.message || payload.error || "Falha ao consultar a fila de sincronização.",
        });
        return;
      }
      setData({
        items: Array.isArray(payload.items) ? payload.items : [],
        stats: payload.stats && typeof payload.stats === "object"
          ? payload.stats
          : { total: 0, pending: 0, processing: 0, synced: 0, error: 0 },
        connected: payload.connected !== false,
        message: payload.message || "",
      });
    } catch {
      setData({
        items: [],
        stats: { total: 0, pending: 0, processing: 0, synced: 0, error: 0 },
        connected: false,
        message: "Não foi possível consultar a fila de sincronização.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load("all"); }, [load]);

  function changeStatus(next) {
    setStatus(next);
    load(next);
  }

  const stats = data.stats || {};

  return (
    <PageShell
      title="Sincronização"
      actions={<button type="button" className="ghost-button" onClick={() => load(status)}>{loading ? "Atualizando…" : "Atualizar"}</button>}
    >
      <section className="section-intro">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h2>Fila Neon → Google Sheets</h2>
          <p>Acompanhe o processamento das capturas, tentativas, erros e confirmações de sincronização do espelho operacional.</p>
        </div>
        <div className="big-counter">
          <span>Total na fila</span>
          <strong>{stats.total ?? 0}</strong>
        </div>
      </section>

      <section className="metrics-grid sync-metrics">
        <article className="metric-card">
          <div className="metric-topline"><span>Pendentes</span><i className="metric-dot" /></div>
          <strong>{stats.pending ?? 0}</strong><small>aguardando processamento</small>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span>Processando</span><i className="metric-dot accent" /></div>
          <strong>{stats.processing ?? 0}</strong><small>em execução agora</small>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span>Sincronizados</span><i className="metric-dot accent" /></div>
          <strong>{stats.synced ?? 0}</strong><small>concluídos com sucesso</small>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span>Erros</span><i className="metric-dot" /></div>
          <strong>{stats.error ?? 0}</strong><small>requerem atenção</small>
        </article>
      </section>

      <article className="panel sync-table-panel">
        <div className="panel-header sync-toolbar">
          <div>
            <p className="eyebrow">QUEUE</p>
            <h3>Eventos de sincronização</h3>
          </div>
          <div className="segmented-control">
            {[
              ["all", "Todos"],
              ["pending", "Pendentes"],
              ["processing", "Processando"],
              ["synced", "Sincronizados"],
              ["error", "Erros"],
            ].map(([value, label]) => (
              <button type="button" key={value} onClick={() => changeStatus(value)} className={status === value ? "active" : ""}>{label}</button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Pessoa</th>
                <th>Empresa</th>
                <th>Tentativas</th>
                <th>Criado em</th>
                <th>Última ação</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length ? data.items.map((item) => (
                <tr key={item.id}>
                  <td><StatusPill status={item.status} /></td>
                  <td>
                    {item.linkedin_url ? <a className="table-link" href={item.linkedin_url} target="_blank" rel="noreferrer">{item.full_name || "Perfil"} ↗</a> : (item.full_name || "—")}
                    <small>{item.current_title || ""}</small>
                  </td>
                  <td>{item.company_name || "—"}</td>
                  <td>{item.attempts ?? 0}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    {formatDate(item.synced_at || item.last_attempt_at)}
                    {item.last_error ? <small className="error-text">{item.last_error}</small> : null}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">
                      <div className="empty-icon">↻</div>
                      <b>{loading ? "Carregando…" : "Nenhum evento nesta visão"}</b>
                      <p>{data.message || "A fila está vazia para o filtro selecionado."}</p>
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
