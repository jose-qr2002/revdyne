// Puerto por defecto de la app instalada. Mismo valor que BASE_PORT en server.js y DEFAULT_PORT en backend/overlays/*.html
// (las páginas del overlay lo asumen cuando el enlace no trae ?port=).
export const DEFAULT_PORT = 47321;
// En desarrollo el backend usa el 3000 (a menos que se indique otro con VITE_BACKEND_PORT, ver vite.config.js)
const DEV_BACKEND_PORT = 3000;

// Sufijo del enlace de Live Studio: solo hace falta indicar el puerto si no es el de por defecto. Es una pista: la página del
// overlay prueba además el rango por defecto (+20), así que un enlace antiguo sigue funcionando aunque la app cambie de puerto.
export const portQuery = (port) => (Number(port) === DEFAULT_PORT ? '' : `?port=${port}`);

// Puerto de la app (el servidor local que sirve overlays y datos). En producción es el de la propia página del panel; en desarrollo
// el panel va por Vite y el backend en otro puerto (VITE_BACKEND_PORT).
export const currentAppPort = () => (import.meta.env.DEV
  ? Number(import.meta.env.VITE_BACKEND_PORT) || DEV_BACKEND_PORT
  : Number(window.location.port) || DEFAULT_PORT);
