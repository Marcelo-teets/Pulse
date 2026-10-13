"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function fmt(value) {
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
      <strong>{value ?? 0}</strong>
      <small>{hint}</small>
    </article>
  );
}

const SHEETS_LABELS = {
  ready: "API acessível, abas conferidas",
  api_disabled: "Google Sheets API desabilitada",
  not_configured: "Credenciais/planilha não configuradas",
  permission_denied: "Conta de serviço sem acesso à planilha",
  sheet_not_found: "Planilha não encontrada ou inacessível",
  missing_tabs: "Planilha com abas obrigatórias ausentes",
  auth_failed: "Falha na autenticação da conta de serviço",
  rate_limited: "Google Sheets limitou temporariamente as consultas",
  unreachable: "Google Sheets indisponível ou sem resposta",
};
const MIN_EXTENSION_VERSION = "0.8.9";
function extensionOutdated(value) {
  const parts = String(value || "").split(".").map(Number);
  const minimum = MIN_EXTENSION_VERSION.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return true;
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== minimum[i]) return parts[i] < minimum[i];
  }
  return false;
}

function DeviceStatus({ status, version }) {
  const normalized = status || "active";
  const outdated = normalized === "active" && extensionOutdated(version);
  const label = outdated ? "Atualização necessária" : normalized === "active" ? "Ativo" : normalized === "revoked" ? "Revogado" : "Expirado";
  return <span className={"status-pill " + (normalized === "active" && !outdated ? "synced" : "error")}>{label}</span>;
}

export default function OperationsPage() {
  const [data, setData] = useState({
    connected: true,
    summary: {},
    devices: [],
    audit: [],
    quality: {},
  });
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState({ warnings: [], metrics: {} });
  const [retryNotice, setRetryNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }
      if (response.status === 403) {
        window.location.href = "/";
        return;
      }
      setData(await response.json());
      const healthResponse = await fetch("/api/operations/health", { cache: "no-store" });
      if (healthResponse.ok) setHealth(await healthResponse.json());
    } catch {
      setData({
        connected: false,
        summary: {},
        devices: [],
        audit: [],
        quality: {},
        message: "Não foi possível consultar o backend.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function retrySheets() {
    setRetryNotice("Solicitando reprocessamento...");
    try {
      const response = await fetch("/api/operations/retry", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível reenfileirar.");
      setRetryNotice(result.queued + " registro(s) reenfileirados para o cron.");
      await load();
    } catch (error) { setRetryNotice(error.message); }
  }
  const s = data.summary || {};
  const outdatedDevices = (data.devices || []).filter((device) => device.status === "active" && extensionOutdated(device.extension_version));

  return (
    <PageShell
      title="Operação"
      actions={<button type="button" className="ghost-button" onClick={load}>{loading ? "Atualizando…" : "Atualizar"}</button>}
    >
      <section className="section-intro">
        <div>
          <p className="eyebrow">OBSERVABILITY</p>
          <h2>Saúde, segurança e qualidade da captura</h2>
          <p>
            Monitore dispositivos pareados, autenticações, falhas, backlog de sincronização
            e qualidade dos dados sem expor credenciais da extensão.
          </p>
        </div>
        <div className="big-counter">
          <span>API</span>
          <strong>{data.connected ? "OK" : "—"}</strong>
        </div>
      </section>

      {outdatedDevices.length > 0 && (
        <p className="form-error" role="alert">
          {outdatedDevices.length} dispositivo(s) pareado(s) com extensão incompatível.
          Atualize para a versão v0.9.2 e recarregue a extensão no Chrome antes de capturar.
        </p>
      )}

      <article className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <div className="panel-header"><div><p className="eyebrow">AUTOMAÇÃO</p><h3>Monitoramento e reprocessamento</h3></div></div>
        <p role="status"><strong>Conexão Google Sheets:</strong> {SHEETS_LABELS[health.sheets?.state] || "Ainda não verificada"}. {health.sheets?.checked_at ? "Última verificação: " + fmt(health.sheets.checked_at) : ""}</p>
        {health.sheets?.state === "api_disabled" && <p role="alert" className="form-error">Habilite a Google Sheets API no projeto Google Cloud associado à conta de serviço. <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noreferrer">Abrir biblioteca de APIs do Google Cloud ↗</a>. Uma fila vazia não comprova a integração.</p>}
        {health.sheets?.state === "missing_tabs" && <p role="alert">Abas faltantes: {(health.sheets.missing_tabs || []).join(", ")}.</p>}
        <p>Falhas na fila: {health.metrics?.errors ?? "—"} · Em processamento travado: {health.metrics?.stalled ?? "—"} · Dispositivos ainda não verificados na v0.9.2: {health.metrics?.unverified_devices ?? "—"}</p>
        {(health.warnings || []).map((warning) => <p role="alert" key={warning}>{warning}</p>)}
        <button type="button" className="ghost-button" onClick={retrySheets}>Reenfileirar erros do Sheets</button>
        {retryNotice && <p role="status">{retryNotice}</p>}
        <p><small>O cron do plano Hobby realiza a sincronização às 09:00 UTC; este botão não executa sincronização imediata.</small></p>
      </article>
      <section className="metrics-grid">
        <Metric label="Dispositivos ativos" value={s.active_devices} hint="credenciais válidas" accent />
        <Metric label="Backlog Sheets" value={s.sync_backlog} hint="pending + processing + error" />
        <Metric label="Capturas 24h" value={s.captures_24h} hint="eventos de pessoa" />
        <Metric label="Falhas API 24h" value={s.api_failures_24h} hint="eventos técnicos malsucedidos" />
      </section>

      <section className="metrics-grid">
        <Metric label="Pessoas únicas" value={s.unique_people} hint="camada canônica" accent />
        <Metric label="Empresas únicas" value={s.unique_companies} hint="camada canônica" />
        <Metric label="Qualidade média" value={data.quality?.average == null ? "—" : data.quality.average + "%"} hint={(data.quality?.scored || 0) + " capturas avaliadas"} />
        <Metric label="Última captura" value={s.last_capture_at ? fmt(s.last_capture_at) : "—"} hint={"Sheets: " + fmt(s.last_sheet_sync_at)} />
      </section>

      <section className="two-column">
        <article className="panel main-panel">
          <div className="panel-header">
            <div><p className="eyebrow">DEVICES</p><h3>Dispositivos pareados</h3></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Dispositivo</th><th>Status</th><th>Versão</th><th>Último acesso</th><th>Expiração</th></tr></thead>
              <tbody>
                {data.devices?.length ? data.devices.map((device) => (
                  <tr key={device.device_id}>
                    <td><b>{device.device_name || "Chrome"}</b><small>{device.device_id}</small></td>
                    <td><DeviceStatus status={device.status} version={device.extension_version} /></td>
                    <td>{device.extension_version || "—"}</td>
                    <td>{fmt(device.last_seen_at || device.created_at)}</td>
                    <td>{fmt(device.token_expires_at)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="5"><div className="empty-state"><div className="empty-icon">◎</div><b>Nenhum dispositivo pareado</b><p>O primeiro Chrome v0.9.2 aparecerá aqui após o pareamento.</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="stack">
          <article className="panel">
            <div className="panel-header compact"><div><p className="eyebrow">RUNTIME</p><h3>Estado atual</h3></div></div>
            <div className="pipeline">
              <div className="pipeline-row"><span><i className={data.connected ? "node active-node" : "node"} />API / Neon Function</span><span className={"status-pill " + (data.connected ? "synced" : "error")}>{data.connected ? "Online" : "Falha"}</span></div>
              <div className="connector-line" />
              <div className="pipeline-row"><span><i className={Number(s.sync_backlog || 0) === 0 ? "node active-node" : "node"} />Fila Google Sheets</span><span className={"status-pill " + (Number(s.sync_backlog || 0) === 0 ? "synced" : "pending")}>{s.sync_backlog || 0} itens</span></div>
              <div className="connector-line" />
              <div className="pipeline-row"><span><i className={Number(s.api_failures_24h || 0) === 0 ? "node active-node" : "node"} />Auditoria API</span><span className={"status-pill " + (Number(s.api_failures_24h || 0) === 0 ? "synced" : "error")}>{s.api_failures_24h || 0} falhas</span></div>
            </div>
          </article>
        </aside>
      </section>

      <article className="panel sync-table-panel" style={{ marginTop: 14 }}>
        <div className="panel-header">
          <div><p className="eyebrow">AUDIT TRAIL</p><h3>Eventos recentes da API</h3></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Evento</th><th>Dispositivo</th><th>Request</th><th>HTTP</th><th>Versão</th><th>Horário</th></tr></thead>
            <tbody>
              {data.audit?.length ? data.audit.map((event) => (
                <tr key={event.id}>
                  <td><span className={"status-pill " + (event.success ? "synced" : "error")}>{event.event_type}</span></td>
                  <td>{event.device_id || "—"}</td>
                  <td><small>{event.request_id || "—"}</small></td>
                  <td>{event.http_status}</td>
                  <td>{event.extension_version || "—"}</td>
                  <td>{fmt(event.created_at)}</td>
                </tr>
              )) : (
                <tr><td colSpan="6"><div className="empty-state"><div className="empty-icon">⌁</div><b>Nenhum evento ainda</b><p>O pareamento e as capturas começarão a preencher a auditoria.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </PageShell>
  );
}
