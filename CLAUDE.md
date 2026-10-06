# Revdyne

App de escritorio (Electron) que convierte eventos de TikTok LIVE (regalos, likes,
seguidores, stickers, comentarios) en acciones: teclas, sonidos y voz (TTS).
Idioma de la interfaz y de los mensajes al usuario: español.

## Estructura
- `main.js` / `splash.html`: arranque de Electron, instancia única, splash, actualizaciones.
- `server.js`: Express + Socket.IO. Lo carga main.js después del splash.
- `backend/`: paths.js, data/ (store, bootstrap, defaults), routes/, services/.
- `frontend/`: React + Vite. Estilos en `frontend/src/index.css` (variables, acento rosa `--accent`).
- `proteger.js`: ofuscación al empaquetar (afterPack). electron-builder con asar: false.

## Datos (en AppData\Roaming\Revdyne, no en el repo)
config.json, profiles.json, catalog.json, stickers.json, license.json. Todo se lee/escribe
con `backend/data/store.js`. Las rutas se definen solo en `backend/paths.js`.

## Modelo
- Un perfil = acciones + eventos. `prof_global` siempre se procesa además del perfil activo.
- Los stickers son eventos con `trigger: 'sticker'` dentro de events[].
- Acciones: keyboard y sound (actionDispatcher.js). Las teclas pasan por actionQueue.js.
- La UI guarda perfiles con `onUpdateProfiles` (App.jsx -> POST /api/profiles).
  Ninguna pestaña escribe perfiles por su cuenta: eso causó pérdida de datos.

## Licencias
Plan free (límites en backend/services/entitlements.js) y pro con código.
Cliente: backend/services/license.js. Servidor propio en un VPS (fuera de este repo).
No tocar la llave pública ni el servidor desde aquí.

## Reglas de código
- Los Hooks de React siempre antes de cualquier `return` condicional y dentro del componente.
- `eventEngine.findMatchingEvents` no debe contar dos veces el perfil global si es el activo.
- No escribir en la carpeta de instalación ni en Documentos (el acceso controlado a carpetas
  de Windows lo bloquea). Datos en AppData.
- Respetar `prefers-reduced-motion`.

## No tocar sin preguntar
keys/, *.pem, *.db, license.json, package.json (version/build/publish), proteger.js.

## Comandos
- Desarrollo: `npm run dev` (backend) y `cd frontend && npm run dev`; app: `npm start`.
- Instalador: `npm run dist`. Lint del frontend: `cd frontend && npm run lint`.
- Lo que depende de Windows, de un directo real o del VPS no se puede probar desde aquí:
  dejarlo anotado en TASKS.md para que lo pruebe una persona.
