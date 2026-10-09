// Avisos dentro de la app (modales) en lugar de los cuadros nativos del sistema.
//
// Los alert() nativos de Windows bloquean la ventana y, al cerrarlos, Electron suele dejar los campos de texto sin foco: hay que
// hacer clic fuera y volver para poder escribir. showAlert() abre un modal propio (ver components/AlertHost.jsx), que además
// devuelve el foco al campo donde estabas.
//
//   showAlert('Texto', { title: 'Falta un dato', type: 'warning' | 'error' | 'info' })  ->  Promise que se cumple al cerrarlo
//
// AlertHost (montado en App.jsx) se suscribe con subscribe(); si no hubiera ninguno montado, el aviso espera en la cola.

let listener = null;
const pending = [];

export function showAlert(message, { title, type = 'warning' } = {}) {
  return new Promise((resolve) => {
    const item = { message: String(message ?? ''), title, type, resolve };
    if (listener) listener(item); else pending.push(item);
  });
}

// Lo usa AlertHost: recibe los avisos nuevos (y los que esperaban en cola)
export function subscribe(fn) {
  listener = fn;
  while (pending.length) fn(pending.shift());
  return () => { if (listener === fn) listener = null; };
}
