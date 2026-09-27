import { Brand } from './Brand';

const shelves = [
  { title: 'Continue watching', eyebrow: 'Back to your stories', tile: 'violet' },
  { title: 'Trending now', eyebrow: 'Fresh from the world', tile: 'red' },
  { title: 'Because you watched', eyebrow: 'Chosen for you', tile: 'blue' },
  { title: 'New in cinemas', eyebrow: 'This season', tile: 'amber' }
];

export function AppShell({ viewerName = 'Viewer' }: { viewerName?: string }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <nav aria-label="Primary navigation" className="nav-links">
          <a href="#home" aria-current="page">Home</a>
          <a href="#movies">Movies</a>
          <a href="#series">Series</a>
        </nav>
        <Brand />
        <div className="topbar-actions">
          <label className="search-field">
            <span className="sr-only">Search movies and series</span>
            <input type="search" placeholder="Search" />
          </label>
          <button className="avatar" type="button" aria-label="Open profile menu">A</button>
        </div>
      </header>

      <main id="home" className="library-home">
        <section className="home-intro" aria-labelledby="home-heading">
          <p className="eyebrow">Your library</p>
          <h1 id="home-heading">Good evening, {viewerName}.</h1>
          <p>Everything you love, quietly organised and ready to play.</p>
        </section>

        <section className="shelf-grid" aria-label="Your movie collections">
          {shelves.map((shelf, index) => (
            <article className="shelf-card" key={shelf.title}>
              <div className={`fallback-art fallback-art--${shelf.tile}`} aria-hidden="true">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i />
              </div>
              <p className="eyebrow">{shelf.eyebrow}</p>
              <h2>{shelf.title}</h2>
              <p className="shelf-meta">Curated locally · Updated just now</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
