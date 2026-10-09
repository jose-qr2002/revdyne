# Pendientes de prueba manual

Cosas que dependen de Windows, de un directo real o del instalador y no se pudieron probar desde Claude Code.

## Overlay de meta de likes
- [ ] En un directo real, comprobar que la barra sube con los likes (solo se probó con el botón de probar
      y simulando ráfagas por código).
- [ ] Añadir la URL como fuente "Navegador" en OBS (900x120) y comprobar transparencia, fuentes del
      sistema y que el indicador pase a "Conectado".
- [ ] "Acciones al finalizar" con una acción de teclado real dentro del juego.
- [ ] Instalador (`npm run dist`): comprobar que `/overlays/goal/likes` carga con el build ofuscado y
      que `overlays.json` se crea en AppData\Roaming\Revdyne.
- [ ] Imagen de la barra (URL propia) con un PNG de 880x140: revisar si debe ir encima o debajo del relleno.
- [ ] Revisar con el diseño original los estilos 2-5: son interpretación propia (solo se vio el 1).

## Conteo de likes
- [ ] La librería usa tiktok-live-proto v3: el evento `like` trae `count` (lote) y `total` (string, total de la sala).
      La barra muestra el `total` de la sala (arranca con los likes que ya tenga el directo). Comparar en un directo con muchos likes que llegue
      al 100% cuando el contador real de TikTok sube lo configurado. Si `total` no llegara, cae a sumar `count`.
- [ ] Conectar a un directo que ya tenga likes (p. ej. 20.000 con meta 45.000): la barra debe arrancar en 20.000
      sin disparar la acción final. Tras cruzar la meta en vivo debe disparar una vez.

## TikTok LIVE Studio (overlay alojado en overlays.reveljk.com)
- [ ] Subir `backend/overlays/goal.html` al VPS y servirlo en `https://overlays.reveljk.com/goal/likes`
      (el mismo archivo funciona en local y remoto). Subdominio nuevo: DNS + nginx en /var/www/revdyne-overlays + certbot.
- [ ] En Live Studio añadir un Enlace con la URL del panel (modo "TikTok LIVE Studio", lleva `?port=3000`).
      Debe mostrar la barra y el chip del panel pasar a "OBS enlazado".
- [ ] Si Live Studio no conecta con 127.0.0.1 desde una página https (el motor embebido puede bloquearlo como
      contenido mixto o por Private Network Access), la alternativa es un relé por el VPS o OBS + cámara virtual.
- [ ] Cada vez que cambie goal.html hay que volver a subirlo al VPS.
- [ ] Live Studio: sin Resolución personalizada la barra debe verse ancha y baja (lienzo mínimo 900). Con Resolución
      personalizada H 120 y W 900 es la medida base; con W mayor la barra se alarga sin subirle el alto. Revisar también
      los ajustes Largo/Grosor de Personalizar.

## Meta de seguidores
- [ ] En el VPS: subir `goal.html` (antes se llamaba goalLikes.html) y cambiar el `location` de nginx a
      `location ~ ^/goal/(likes|followers)$ { alias ... }` apuntando a goal.html (ver instrucciones en el chat).

## Seguidores exactos y enlace
- [x] Probado en un directo real (@teamgatitos_oficial): roomInfo.follower_count y followCount coinciden y son exactos.
- [x] Likes verificados en un directo real (@watef4k): la barra coincide con el total de TikTok (la suma de lotes quedaba un 22% corta).
- [ ] Modo "Solo nuevos del directo" en ambas metas: debe arrancar en 0 y contar desde que se conecta.
- [ ] Sin ningún enlace en uso (ni OBS ni Live Studio): no debe dispararse ninguna acción. Al enlazar con el directo ya
      iniciado, la barra se sincroniza sin disparar metas superadas.

## Meta de compartidas
- [ ] VPS: añadir shares al regex de nginx: `location ~ ^/goal/(likes|followers|shares)$ { ... }` y volver a subir goal.html.
- [x] Compartidas probadas en un directo real (@watef4k): con "Solo una por usuario" 4 eventos del mismo usuario cuentan 1.
- [ ] Comprobar con "Todas" en un directo real que cada compartida del mismo usuario suma (solo probado con eventos reales simulados).
- [ ] Si el evento `share` no trae identificador de usuario, no se puede deduplicar y cuenta siempre.

## Meta de espectadores
- [ ] VPS: añadir viewers al regex de nginx: `location ~ ^/goal/(likes|followers|shares|viewers)$ { ... }` y volver a subir goal.html.
- [x] Probado en un directo real (@watef4k): la barra sigue a roomUser.total (10-16 espectadores) subiendo y bajando.
- [ ] Revisar en Live Studio el ícono de ojo y que con "Mantener meta" la acción se vuelva a disparar al volver a superar la meta.

## Meta de monedas y contador de regalos
- [ ] VPS: añadir coins al regex de nginx: `location ~ ^/goal/(likes|followers|shares|viewers|coins)$ { ... }` y volver a subir goal.html.
- [ ] Contador de regalos (giftStreaks.js): reemplaza el seguimiento por usuario+regalo. Con datos reales (37 eventos) coincide
      con la verdad por groupId, pero los casos que fallaban antes (cierre perdido, cierre tardío, mismo nombre) solo se
      reprodujeron con escenarios simulados. Revisar en un directo con ráfagas grandes (p. ej. 100 rosas) que no se pierda ni
      se sume de más ninguna, y que las reglas de regalo → acción disparen el número correcto de veces.
- [ ] Los regalos sin combo (Confetti, etc.) se cuentan como 1 por evento: confirmar con envíos de varias unidades a la vez.
- [ ] Meta de monedas: comprobar que las monedas coinciden con lo que muestra TikTok para los regalos recibidos.

## Registro de errores (log)
- [x] El log se crea y se escribe en AppDataRoamingevdynelogsevdyne.log con la app Electron (comprobado con el archivo real).
- [ ] "Abrir carpeta" dentro de Electron (usa shell.showItemInFolder): en node puro se verificó que abre la ventana del Explorador,
      pero en Electron falló por un error corregido (logger.dir salía undefined). Confirmar tras reiniciar la app.
- [ ] Durante un directo largo revisar el log: líneas [WARN]/[ERROR], "Sin eventos de TikTok" (conexión muda) y "Desconexión inesperada".
- [ ] Con el registro detallado activo, buscar ráfagas con "salto_grande"/"sin_cierre" y comparar con los regalos que se perdieron.
- [ ] No hay reconexión automática: si el log muestra desconexiones inesperadas frecuentes, valorar añadirla.
- [x] Prueba de 5 min en un directo con muchos regalos (@caydensitoh_): 195 regalos, ráfagas de hasta 66 unidades, 46/46 ráfagas idénticas entre la app y una
      captura independiente, barra de monedas == suma del registro, sin avisos ni errores. El algoritmo anterior también acertó en esa muestra
      (los fallos corregidos son casos raros: cierre perdido/tardío), así que la mejora es preventiva.

## Mejor regalo / mejor combo
- [ ] VPS: subir `top.html` junto a `goal.html` y añadir a nginx: `location ~ ^/top/(gift|combo)$ { alias /var/www/revdyne-overlays/top.html; default_type text/html; add_header Cache-Control "no-cache"; }`.
- [ ] En Live Studio: URL `https://overlays.reveljk.com/top/gift?port=3000` (y `/top/combo`) con Resolución personalizada al tamaño del estilo elegido.
- [x] Probado con 326 regalos reales de 3 directos: el líder coincide con el cálculo independiente por ráfaga; overlay enlazado recibió las actualizaciones en vivo.
- [ ] Revisar que los iconos de regalo cargan en Live Studio (vienen de la CDN de TikTok; si alguno caduca se muestra el icono genérico).
- [ ] Log en vivo: una línea por racha (Rose ×24). Comprobado con datos reales (GG ×108, Rose ×29 actualizándose en su sitio).
- [ ] Mejor regalo/combo: estilo compacto por defecto, interruptor "Nombre sobre el regalo" (solo estilo vertical) y tamaño del valor ajustable. Revisar en Live Studio
      la sombra del nombre (ya no se recorta) y que con nombres largos el "…" aparece donde se espera. Hay que volver a subir top.html al VPS.
- [ ] Mejor regalo ya NO es acumulativo (gana el de más valor por unidad, p. ej. capibara ×30 no lo desplazan 100 rosas). Probado con el escenario del capibara y con 326 regalos reales.
      Confirmar en un directo con regalos caros que el líder cambia como se espera. Nuevos ajustes: valor a mostrar (cantidad/monedas/ambos) y fondos transparentes.
      Vuelve a subirse top.html al VPS (cambió).

## Navegación en el sidebar
- [ ] Revisar en la ventana real de Electron (1100x750 por defecto) que el sidebar no se corte y que la lista de secciones haga scroll si hay más.
- [x] Emojis de las secciones migrados a Icon.jsx (TTS, Acciones, Eventos, Stickers, Regalos, Motores de voz, Log, modales). Comprobado en navegador sin emojis visibles.
- [ ] "Limpiar log" ahora solo aparece en la sección Log en vivo (antes estaba siempre en la cabecera).

## Migración de emojis a íconos
- [ ] Revisar a ojo en la app real las pantallas con más cambios: Bot TTS (muchos controles) y los modales de Acciones/Eventos/Stickers (alineación de íconos junto al texto).
- [ ] Los íconos de regalos del Log/Catálogo salen por nivel de monedas (caja, destellos, gema, cohete, corona); si prefieres otro criterio o más niveles, se ajusta en giftUtils.js.
- [ ] Los nombres de eventos del servidor (giftName) aún llevan emoji en backend/services/tiktokService.js y overlayService.js; la interfaz los oculta con plainText(), pero siguen en el registro de errores.
- [ ] Meta de seguidores en un directo restringido (roomInfo 4003110, p. ej. lizzymp37): al conectar debe mostrar el total aproximado del perfil (35800) y al primer follow pasar al exacto (35767...). Probar también en modo "solo lo nuevo" (debe quedar en 0 y contar desde el primer follow).
- [ ] Top 10: subir `backend/overlays/ranking.html` al VPS y añadir a nginx: `location ~ ^/ranking/(gifters|likes|comments|shares)(-daily|-monthly)?$ { alias /var/www/revdyne-overlays/ranking.html; default_type text/html; add_header Cache-Control "no-cache"; }`.
- [ ] Top 10 en un directo real largo: comprobar que los totales cuadran con TikTok (donadores = monedas, likes por persona), que los avatares cargan en Live Studio y que "Del día" sobrevive a cerrar/abrir la app y se reinicia a medianoche.
- [ ] Top 10 "Compartidas": comprobar en un directo real que cuenta bien (el evento share no trae avatar; se usa el último conocido del usuario).
- [ ] Puerto ocupado (versión anterior de esta nota, ahora es el 47321/47322): abrir otro programa en el puerto y arrancar la app instalada: debe abrir en el siguiente sin errores, mostrar el aviso de puerto en Overlays/Top 10 y que los enlaces de Live Studio lleven ?port=3001 y funcionen.
- [ ] Puerto 47321: subir al VPS los 3 HTML nuevos (`goal.html`, `top.html`, `ranking.html`: traen la búsqueda automática de puerto) y volver a copiar los enlaces de Live Studio/OBS una vez (los antiguos con `?port=3000` o sin puerto ya no apuntan al 47321 nuevo; los HTML viejos del VPS no encuentran la app nueva).
- [ ] Con la app instalada y otro programa ocupando el 47321: debe abrir en el 47322, mostrar el aviso de puerto, y un overlay de Live Studio ya configurado debe seguir mostrando datos sin tocar su enlace.
- [ ] En tu PC: `netsh interface ipv4 show excludedportrange protocol=tcp` y comprobar que 47321-47341 no esté dentro de un rango excluido (Hyper-V/WSL/Docker).
