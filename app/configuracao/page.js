"use client";

import { useState } from "react";
import PageShell from "../components/PageShell";

export default function ConfiguracaoPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function generateCode() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/devices/pairing-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "Extensão Chrome" }),
      });
      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.code) {
        setCode("");
        setMessage(payload.error || "Não foi possível gerar o código de pareamento.");
        return;
      }
      setCode(payload.code);
      setMessage("Código gerado. Use-o na extensão antes que expire.");
    } catch {
      setCode("");
      setMessage("Não foi possível acessar o backend para gerar o código.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title="Configuração">
      <section className="section-intro">
        <div>
          <p className="eyebrow">EXTENSÃO</p>
          <h2>Parear dispositivo</h2>
          <p>Gere um código, cole na extensão do Chrome e as próximas capturas ficarão vinculadas ao seu usuário.</p>
        </div>
      </section>
      <article className="panel setup-panel">
        <div>
          <p className="eyebrow">CÓDIGO TEMPORÁRIO</p>
          <h3>{code || "Nenhum código gerado"}</h3>
          <p>O código expira em 20 minutos. Depois de usado, a extensão recebe um token próprio por 90 dias.</p>
          {message && <p className={code ? "form-note" : "form-error"}>{message}</p>}
        </div>
        <button type="button" className="primary-button" onClick={generateCode} disabled={loading}>
          {loading ? "Gerando..." : "Gerar código"}
        </button>
      </article>
    </PageShell>
  );
}
