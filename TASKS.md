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
