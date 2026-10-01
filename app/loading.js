export default function Loading() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div><b>Pulse</b><span>Origination Intelligence</span></div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">PULSE CONTROL CENTER</p><h1>Carregando</h1></div>
        </header>
        <div className="content">
          <section className="hero-panel">
            <div>
              <span className="system-kicker"><i className="live-dot warning" />Preparando ambiente</span>
              <h2>Carregando inteligência operacional…</h2>
              <p>O Pulse está preparando dados e componentes da interface.</p>
            </div>
          </section>
          <section className="metrics-grid" aria-hidden="true">
            {[1,2,3,4].map((item) => (
              <article className="metric-card skeleton-card" key={item}>
                <span className="skeleton-line short" />
                <span className="skeleton-line value" />
                <span className="skeleton-line" />
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
