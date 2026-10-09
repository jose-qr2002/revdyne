import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

// Selector desplegable con el estilo de la app. Reemplaza al <select> nativo: se usa igual (mismos <option> como hijos,
// value y onChange con e.target.value), pero la lista la dibujamos nosotros y no el navegador.
//
//   <Select className="modifier-select" value={x} onChange={e => setX(e.target.value)}>
//     <option value="a">A</option>
//   </Select>
//
// - El value se compara como texto, igual que en un <select> (los números del value también funcionan).
// - La lista se dibuja en un portal con position: fixed, así no la recortan los modales con scroll.
// - Teclado: flechas, Inicio/Fin, Enter/Espacio para elegir, Escape para cerrar.

const PANEL_MAX_HEIGHT = 280;
const GAP = 6;

// Convierte los <option> hijos (también los generados con map o dentro de fragmentos) en una lista
function collectOptions(children, out = []) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'option') {
      const { value, children: label, disabled } = child.props;
      out.push({ value: String(value ?? (typeof label === 'string' ? label : '')), label, disabled: !!disabled });
    } else if (child.props?.children) {
      collectOptions(child.props.children, out);
    }
  });
  return out;
}

export default function Select({ value, onChange, children, className = '', style, disabled = false, id, title, 'aria-label': ariaLabel }) {
  const options = useMemo(() => collectOptions(children), [children]);
  const current = String(value ?? '');
  const selectedIndex = options.findIndex(o => o.value === current);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const listId = useId();

  const firstEnabled = () => options.findIndex(o => !o.disabled);
  const step = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const openMenu = () => {
    if (disabled || !triggerRef.current || options.length === 0) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < Math.min(PANEL_MAX_HEIGHT, options.length * 38 + 12) && above > below; // si abajo no cabe y arriba hay más sitio, se abre hacia arriba
    const maxHeight = Math.max(120, Math.min(PANEL_MAX_HEIGHT, up ? above : below));
    setPos({
      left: r.left, minWidth: r.width, maxWidth: Math.max(r.width, window.innerWidth - r.left - 8), maxHeight,
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled());
    setOpen(true);
  };

  const choose = (i) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    if (opt.value !== current) onChange?.({ target: { value: opt.value, id }, currentTarget: { value: opt.value, id } });
  };

  // Cerrar al hacer clic fuera, al cambiar el tamaño de la ventana o al desplazar algo que no sea la propia lista
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!triggerRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    const onScroll = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // La opción activa (teclado) siempre queda a la vista
  useEffect(() => {
    if (open && active >= 0) panelRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openMenu(); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (k === 'Tab') setOpen(false);
    else if (k === 'ArrowDown') { e.preventDefault(); setActive(a => step(a < 0 ? -1 : a, 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(a => step(a < 0 ? options.length : a, -1)); }
    else if (k === 'Home') { e.preventDefault(); setActive(firstEnabled()); }
    else if (k === 'End') { e.preventDefault(); setActive(step(options.length, -1)); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
  };

  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  return (
    <div className={`sel ${className}`.trim()} style={style}>
      <button
        type="button" ref={triggerRef} id={id} title={title} aria-label={ariaLabel}
        className="sel-trigger" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())} onKeyDown={onKeyDown}
      >
        <span className="sel-label">
          {/* El ancho lo marca la opción más larga (como en un select nativo), así no "salta" al cambiar de opción */}
          <span className="sel-sizer" aria-hidden="true">{options.map((o, i) => <span key={i}>{o.label}</span>)}</span>
          <span className="sel-current">{selected ? selected.label : ''}</span>
        </span>
        <Icon name="chevronDown" size={14} className="sel-chevron" />
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} id={listId} role="listbox" className="sel-panel" style={pos}>
          {options.map((o, i) => (
            <div
              key={i} data-idx={i} role="option" aria-selected={i === selectedIndex} aria-disabled={o.disabled || undefined}
              className={`sel-option${i === selectedIndex ? ' selected' : ''}${i === active ? ' active' : ''}`}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="sel-option-text">{o.label}</span>
              {i === selectedIndex && <Icon name="check" size={15} />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
