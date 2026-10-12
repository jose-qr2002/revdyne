import React from 'react';
import Icon from './Icon';

// Números de página a mostrar: siempre la primera, la última y las de alrededor de la actual (con "…" entre huecos)
function pageNumbers(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); }
  const sorted = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap-' + n);
    out.push(n);
  });
  return out;
}

// Paginación de una lista: "Mostrando 13–24 de 40" y los botones de página. `view` = lo que devuelve useListView.
export default function Pagination({ view, noun }) {
  if (!view.total) return null;
  const { page, pages, setPage, from, to, total } = view;
  return (
    <nav className="lv-pagination" aria-label={`Páginas de ${noun}`}>
      <span className="lv-count">Mostrando {from}–{to} de {total} {noun}</span>
      {pages > 1 && (
        <div className="lv-pages">
          <button className="lv-page" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Página anterior"><Icon name="chevronLeft" size={14} /></button>
          {pageNumbers(page, pages).map(n => (typeof n === 'string'
            ? <span key={n} className="lv-gap">…</span>
            : <button key={n} className={`lv-page${n === page ? ' on' : ''}`} onClick={() => setPage(n)} aria-label={`Página ${n}`} aria-current={n === page ? 'page' : undefined}>{n}</button>))}
          <button className="lv-page" onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Página siguiente"><Icon name="chevronRight" size={14} /></button>
        </div>
      )}
    </nav>
  );
}
