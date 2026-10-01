"use client";

export default function GlobalError({ reset }) {
  return (
    <main className="center-state">
      <div className="state-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">PULSE CONTROL CENTER</p>
        <h1>Algo saiu do esperado</h1>
        <p>A aplicação continua online. Tente recarregar esta visão; se a falha persistir, consulte a página de Operação.</p>
        <div className="state-actions">
          <button className="primary-button" onClick={() => reset()}>Tentar novamente</button>
          <a className="ghost-button" href="/operacao">Abrir Operação</a>
        </div>
      </div>
    </main>
  );
}
