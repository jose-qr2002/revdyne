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
- [ ] Subir `backend/overlays/goalLikes.html` al VPS y servirlo en `https://overlays.reveljk.com/goal/likes`
      (el mismo archivo funciona en local y remoto). Subdominio nuevo: DNS + nginx en /var/www/revdyne-overlays + certbot.
- [ ] En Live Studio añadir un Enlace con la URL del panel (modo "TikTok LIVE Studio", lleva `?port=3000`).
      Debe mostrar la barra y el chip del panel pasar a "OBS enlazado".
- [ ] Si Live Studio no conecta con 127.0.0.1 desde una página https (el motor embebido puede bloquearlo como
      contenido mixto o por Private Network Access), la alternativa es un relé por el VPS o OBS + cámara virtual.
- [ ] Cada vez que cambie goalLikes.html hay que volver a subirlo al VPS.
- [ ] El alto del recuadro de la fuente fija el tamaño de la barra y el ancho fija su largo (a 900x120 es la medida
      original). En Live Studio comprobar que ensanchar el recuadro alarga la barra sin subirle el alto, y los
      ajustes Largo/Grosor de Personalizar.
