"use client";

import { useState } from "react";
import PageShell from "../components/PageShell";

export default function ConfiguracaoPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateCode() {
    setLoading(true);
    const response = await fetch("/api/devices/pairing-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Extensão Chrome" }),
    });
    if (response.status === 401) {
      window.location.href = "/auth";
      return;
    }
    const payload = await response.json();
    setCode(payload.code || "");
    setLoading(false);
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
        </div>
        <button className="primary-button" onClick={generateCode} disabled={loading}>
          {loading ? "Gerando..." : "Gerar código"}
        </button>
      </article>
    </PageShell>
  );
}
