import { useState } from 'react';

// Listas de la app paginadas de 12 en 12 (eventos y acciones)
export const LIST_PAGE_SIZE = 12;

// Texto para buscar: sin mayúsculas ni tildes ("accion" encuentra "Acción")
export const searchKey = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Paginación de una lista ya filtrada. `resetKey` identifica los filtros/búsqueda actuales: al cambiar, vuelve a la página 1 (sin efectos:
// se ajusta durante el propio render). Si la lista se acorta (p. ej. se borra el último de la última página), la página se ajusta sola.
export function useListView(items, resetKey, pageSize = LIST_PAGE_SIZE) {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  // Cambió la búsqueda o algún filtro: se reinicia en la página 1 DE VERDAD (si solo se ignorara, al volver a los filtros anteriores reaparecería la página vieja)
  if (state.key !== resetKey) setState({ key: resetKey, page: 1 });
  const requested = state.key === resetKey ? state.page : 1;
  const page = Math.min(Math.max(1, requested), pages);
  const setPage = (p) => setState({ key: resetKey, page: p });
  // Saltar a una página que se verá con OTROS filtros (p. ej. tras limpiarlos): se guarda con la clave de esos filtros
  const jumpTo = (p, key) => setState({ key, page: p });
  const start = (page - 1) * pageSize;
  return {
    page, pages, setPage, jumpTo, total: items.length,
    pageItems: items.slice(start, start + pageSize),
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    lastPageFor: (count) => Math.max(1, Math.ceil(count / pageSize)), // página que tendría una lista de `count` elementos
  };
}
