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
config.json, profiles.json, catalog.json, stickers.json, overlays.json, license.json. Todo se lee/escribe
con `backend/data/store.js`. Las rutas se definen solo en `backend/paths.js`.

## Modelo
- Un perfil = acciones + eventos. `prof_global` siempre se procesa además del perfil activo.
- Los stickers son eventos con `trigger: 'sticker'` dentro de events[].
- Acciones: keyboard y sound (actionDispatcher.js). Las teclas pasan por actionQueue.js.
- La UI guarda perfiles con `onUpdateProfiles` (App.jsx -> POST /api/profiles).
  Ninguna pestaña escribe perfiles por su cuenta: eso causó pérdida de datos.

## Overlays (fuentes de navegador para OBS / TikTok LIVE Studio)
- Metas de likes, seguidores, compartidas y espectadores. Página autónoma `backend/overlays/goal.html` (sin React), servida por server.js en
  `/overlays/goal/likes|followers|shares|viewers` y alimentada por Socket.IO. La vista previa del panel es un iframe de esa misma
  página (`?preview=1`). Live Studio exige https + dominio real: el mismo HTML se aloja en overlays.reveljk.com y
  se conecta a la app local (127.0.0.1) por Socket.IO.
- Lógica y estado en `backend/services/overlayService.js` (una meta por tipo); config en overlays.json (se guarda
  desde `GoalCard` vía `/api/overlays/:kind`, no por profiles). Modo de conteo por meta (`countMode`): 'total' (empieza
  con lo que ya hay) o 'live' (solo lo nuevo del directo). Ambas siguen el TOTAL que informa TikTok, no la suma de eventos:
  likes = campo `total` del evento like; seguidores = `roomInfo.data.owner.follow_info.follower_count` al conectar (sin
  petición extra) + `followCount` de cada evento follow (verificado exacto en un directo real). Los seguidores pueden bajar
  (unfollow); los likes solo suben. Compartidas: no hay total fiable, se cuentan eventos `share` desde que se conecta;
  `allowMultiple` false = solo la primera compartida de cada usuario (Set `sharedUsers`), true = todas. El usuario del evento
  share llega como `{ id, secUid, displayId, nickname }` SIN `userId`/`uniqueId` (otros eventos sí): ver `shareUserKey`.
- Espectadores: NO acumulado, sigue el número actual (sube y baja). Viene del evento `roomUser`, campo `total` (string);
  `totalUser` es el acumulado de entradas y no se usa. Valor inicial: `roomInfo.data.user_count`. Con "Mantener meta" se
  vuelve a armar al bajar de la meta; Aumentar/Duplicar son de un solo sentido.
- Las metas solo trabajan con un overlay real enlazado (sala de Socket.IO `overlay:<tipo>`; la vista previa del panel no
  cuenta): sin enlace no disparan acciones, no emiten y no consultan el perfil; al enlazar se sincronizan en silencio.
- tiktok-live-proto v3 (el que usa la librería): like trae `count`/`total`; los nombres `likeCount`/`totalLikeCount` son de v1.

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
