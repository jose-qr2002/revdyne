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
- Metas de likes, seguidores, compartidas, espectadores y monedas. Página autónoma `backend/overlays/goal.html` (sin React), servida por server.js en
  `/overlays/goal/likes|followers|shares|viewers|coins` y alimentada por Socket.IO. La vista previa del panel es un iframe de esa misma
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
- Monedas: suma de `gift.diamondCount` × unidades nuevas desde que se conecta (no hay total de monedas fiable); cuenta todos
  los regalos, incluso los que no llegan a `minCoins` de las reglas.
- Regalos con combo (rosas...): `giftStreaks.js` cuenta unidades nuevas por `groupId` (una ráfaga = un groupId; el evento
  de cierre repite el conteo final). NO usar usuario+regalo como clave: perder un cierre hacía ignorar la ráfaga siguiente.
  El usuario del evento gift trae `id`/`displayId` (sin `userId`). Se descartan mensajes repetidos por `common.msgId`.
- Racha de regalos: `giftStreaks.process()` devuelve { units (incremento de este evento, para disparar acciones al instante), total (racha acumulada de
  la ráfaga), ended, key }. El conteo SIEMPRE fue exacto (suma de incrementos == repeatCount final); lo que confundía era el Log en vivo mostrando
  cada incremento como una línea. `giftReceived` lleva `groupId`, `streakTotal`, `streakEnded` y useSocket agrupa por groupId (una línea "Rose ×24").
- Mejor regalo / mejor combo: `backend/services/topService.js` (kinds `topgift`, `topcombo`), página `backend/overlays/top.html` en
  `/overlays/top/gift|combo`, API `/api/overlays/top` (montada ANTES de `/api/overlays`), UI `TopCard.jsx`. NINGUNO es acumulativo (muestran una sola ráfaga).
  Mejor regalo = el regalo de MAYOR VALOR POR UNIDAD con la cantidad de su ráfaga (capibara ×30); solo lo reemplaza un regalo de más valor (100 rosas
  no desplazan a un capibara); empate en valor -> gana la ráfaga con más unidades. Mejor combo = ráfaga con más unidades (mínimo 2); empate -> más valor. Se actualiza en vivo mientras la ráfaga líder crece; se reinicia al conectar.
  3 estilos con lienzo propio (560×170, 480×150, 320×374; 320×314 con "nombre sobre el regalo") escalado para caber. Estilo por defecto: 2 (compacto).
  El texto del nombre lleva padding + margen negativo: sin eso su overflow:hidden (para el "…") recorta la sombra al inicio/fin de la palabra. `valueScale` reduce el valor. Ajustes: `valueMode` (count ×N | coins | both, solo mejor regalo), `transparentTitle`/`transparentValue` (sin fondo), `nameOverIcon` (estilo 3). Icono: `gift.image.urlList[0]` (CDN de TikTok, `referrerpolicy=no-referrer`).
- Las metas solo trabajan con un overlay real enlazado (sala de Socket.IO `overlay:<tipo>`; la vista previa del panel no
  cuenta): sin enlace no disparan acciones, no emiten y no consultan el perfil; al enlazar se sincronizan en silencio.
- tiktok-live-proto v3 (el que usa la librería): like trae `count`/`total`; los nombres `likeCount`/`totalLikeCount` son de v1.

## Registro de errores (log)
- `backend/services/logger.js`: archivo `revdyne.log` en AppDataRoamingRevdynelogs (ruta en paths.js: LOGS_DIR/LOG_FILE),
  rotación por tamaño (2 MB, 3 archivos). Escritura síncrona; nunca debe lanzar error. Uso: `logger.info|warn|error(categoria, mensaje, datos)`;
  `debug` solo si está activo el "registro detallado" (config `logDebug`, interruptor en el panel). Solo ids/conteos/@usuario, nunca
  tokens ni cookies. Mensajes idénticos (mismo texto y datos) repetidos en 5 s se resumen en una línea.
- Qué se registra: conexión (conectar, fallos, desconexión inesperada con código, directo terminado, conexión muda 45 s), anomalías de
  regalos (giftStreaks `onAnomaly`), excepciones en manejadores de eventos (`guard` en tiktokService), errores del proceso, overlays
  (enlace, meta alcanzada, acción final inexistente), RobotJS y estadísticas de eventos cada 5 min.
- API: `/api/logs` (últimas líneas), `/api/logs/debug`, `/api/logs/open`. UI: panel "Registro de errores" en la pestaña Log en vivo.
- El evento `error` de la librería llega como `{ info, exception }`, no como Error.
- Ubicación real: app con Electron (`npm start` / instalada) = `%APPDATA%Revdynelogsevdyne.log`; modo `npm run dev` (node puro) = `./logs/revdyne.log`
  del directorio donde se lance (ignorado por git con `*.log`). `logger.file`/`logger.dir` son getters: NO exportar con `{ ...proxy }` (el spread los pierde).
- "Abrir carpeta" usa `shell.showItemInFolder` (Electron) o `explorer.exe /select` (node) y devuelve cuál funcionó o por qué falló.

## Interfaz (navegación e íconos)
- Las secciones viven en el sidebar (navegación vertical con scroll propio), no en pestañas horizontales. Se definen en `frontend/src/components/navItems.js`
  ({ id, label, icon } agrupados) y su contenido se renderiza en App.jsx con `activeTab === id`. La cabecera muestra el nombre de la sección activa.
- Íconos: `components/Icon.jsx` (SVG de línea, hereda el color). Para uno nuevo, añadir su trazado a `PATHS`. No usar emojis en la interfaz nueva.
  Pendiente de migrar: los emojis dentro del contenido de TTSControl, ActionsTab, EventsTab, StickersTab, CatalogTab, GiftCard, EngineManagerTab, EventLog,
  GiftConfigModal, LicenseModal y StickerSettingsModal.
- Ya no hay "motor de teclado activo" en el sidebar; solo aparece un aviso "Teclado en simulación" si RobotJS no cargó (config.robotAvailable === false).

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
