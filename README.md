# 🎁 TikTok Gift Keys
### App estilo TikFinity – Convierte regalos de TikTok Live en pulsaciones de teclado

---

## ✨ ¿Qué hace?

Cada vez que alguien te manda un regalo en tu **TikTok Live**, la app automáticamente **presiona la tecla que tú elijas** en tu PC.

Perfecto para:
- 🎮 Activar acciones en juegos
- 🎬 Controlar OBS (cambiar escena, silenciar, etc.)
- 🔊 Disparar sounds/efectos
- Cualquier cosa que responda a un teclado

---

## 🚀 Instalación

### Requisitos
- **Node.js 18+** (descarga en https://nodejs.org)
- **Windows** (RobotJS tiene mejor soporte en Win)
- Debes estar en un **TikTok Live activo** para probar

### Pasos

```bash
# 1. Entra a la carpeta
cd tiktok-gift-keys

# 2. Instala dependencias
npm install

# 3. (Opcional pero recomendado) Instala RobotJS para teclas reales
# Requiere Visual Studio Build Tools o node-gyp
npm install @jitsi/robotjs

# 4. Inicia la app
npm start

# 5. Abre tu navegador en:
# http://localhost:3000
```

---

## ⌨️ RobotJS - Teclas reales

Sin RobotJS la app **funciona en modo simulación** (ves en la UI que se presionan las teclas pero no se envían al sistema).

Para activar teclas **reales**:

```bash
# Necesitas Windows Build Tools (solo una vez)
npm install --global windows-build-tools

# Luego instala RobotJS
npm install @jitsi/robotjs
```

Si `@jitsi/robotjs` falla, prueba con:
```bash
npm install robotjs
```

---

## 🎮 Uso

1. Abre **http://localhost:3000**
2. Ingresa tu **usuario de TikTok** (sin @)
3. Clic en **Conectar** (debes estar en live)
4. Cuando llegue un regalo, aparecerá en la lista
5. **Haz clic en el badge de tecla** para capturar la tecla que quieras
6. Elige un **modificador** si quieres (Ctrl, Shift, Alt...)
7. Clic en **Test** para probar

---

## 🗂️ Teclas válidas (ejemplos)

| Lo que presionas | Lo que se envía |
|---|---|
| F1 - F24 | f1 ... f24 |
| Letras | a, b, c... |
| Números | 0 - 9 |
| Flechas | up, down, left, right |
| Especiales | enter, space, escape, tab |
| Numpad | numpad_0 - numpad_9 |

---

## 🔧 Configuración avanzada

- **Tecla global**: Una sola tecla para TODOS los regalos
- **Mínimo de monedas**: Ignorar regalos baratos
- **Cooldown**: Evitar spam (ms entre pulsaciones)
- **Modo debug**: Ver datos raw de cada regalo en consola

---

## 📁 Archivos

```
tiktok-gift-keys/
├── server.js          ← Servidor principal
├── config.json        ← Tu config (se crea automáticamente)
├── package.json
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

---

## ❓ FAQ

**¿Necesito API key de TikTok?**
No. Usa `tiktok-live-connector` que se conecta al WebSocket público del live.

**¿Funciona sin estar en live?**
La conexión fallará. Debes iniciar el live primero en TikTok.

**¿Los regalos se guardan?**
Sí, en `config.json`. La próxima vez que abras la app, tus mapeos estarán guardados.

**¿Puede fallar la conexión?**
TikTok a veces bloquea conexiones frecuentes. Espera unos minutos y reintenta.

---

MIT License | Hecho con ❤️
