import React from 'react';
import Icon from './Icon';
import Select from './Select';

// Barra de búsqueda y filtros de una lista. `filters`: [{ id, label, value, onChange, options: [{ value, label }] }].
// `active` = hay búsqueda o algún filtro puesto (muestra "Limpiar").
export default function ListToolbar({ search, onSearch, placeholder, filters = [], active, onClear }) {
  return (
    <div className="lv-toolbar">
      <div className="lv-search">
        <Icon name="search" size={15} />
        <input type="text" className="key-input" placeholder={placeholder} value={search} onChange={e => onSearch(e.target.value)} aria-label={placeholder} />
        {search && <button className="icon-btn lv-clear" onClick={() => onSearch('')} aria-label="Borrar la búsqueda"><Icon name="x" size={14} /></button>}
      </div>
      {filters.map(f => (
        <label key={f.id} className="lv-filter">
          <span>{f.label}</span>
          <Select className="modifier-select" value={f.value} onChange={e => f.onChange(e.target.value)}>
            {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </label>
      ))}
      {active && <button className="btn btn-secondary btn-sm lv-reset" onClick={onClear}><Icon name="refresh" size={13} /> Limpiar</button>}
    </div>
  );
}
