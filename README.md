# 🎁 TikTok Gift Keys v2

> App estilo TikFinity – Convierte regalos de TikTok Live en pulsaciones de teclado

---

## ✨ ¿Qué hace?

Cada vez que alguien te manda un regalo en tu **TikTok Live**, la app automáticamente **presiona la tecla que tú elijas** en tu PC.

Perfecto para:

- 🎮 Activar acciones en juegos (ej. Left 4 Dead 2)
- 🎬 Controlar OBS (cambiar escena, silenciar, etc.)
- 🔊 Disparar sonidos/efectos
- Cualquier cosa que responda a un teclado

---

## 🚀 Instalación

### Requisitos

- **Node.js 18+ o 22** — [descargar en nodejs.org](https://nodejs.org)
- **Windows** (RobotJS tiene mejor soporte en Win)
- Debes estar en un **TikTok Live activo** para probar

### Pasos rápidos

```bash
# 1. Entra a la carpeta
cd tiktok-gift-keys-v2

# 2. Instala dependencias base
npm install

# 3. (Opcional) Instala RobotJS para pulsaciones físicas
npm install @jitsi/robotjs

# 4. Inicia la app
npm start

# 5. Abre en tu navegador:
#    http://localhost:3000
```

---

## ⌨️ RobotJS – Teclas Reales (Guía Windows)

Sin RobotJS, la app funciona en **modo simulación**: recibe los regalos, reproduce audios y muestra en consola qué tecla se presionaría, pero **no envía la pulsación al sistema**.

Para activar teclas físicas reales es obligatorio instalar `@jitsi/robotjs`. Al estar escrito en C++, requiere compilación local.

### ⚠️ Requisitos ANTES de instalar

Para evitar el error `node-gyp failed to rebuild`, asegúrate de tener instalado:

1. **Python 3**
   - Durante la instalación, marca la casilla **"Add Python to PATH"**

2. **Visual Studio Build Tools 2022** *(versión obligatoria)*
   - Versiones como "2026" o **Visual Studio Code** (ícono azul) **NO sirven**
   - En el instalador morado, marca la tarjeta: **"Desarrollo para el escritorio con C++"**

Una vez listos los requisitos:

```bash
npm install @jitsi/robotjs
```

---

## 🎮 Uso

1. Abre [http://localhost:3000](http://localhost:3000)
2. Ingresa tu usuario de TikTok (sin `@`)
3. Clic en **Conectar** (debes estar en live)
4. Cuando llegue un regalo, aparecerá en la lista
5. Haz clic en el badge de tecla para capturar la tecla que quieras
6. Elige un modificador si quieres (`Ctrl`, `Shift`, `Alt`...)
7. Clic en **Test** para probar (reproducirá el sonido y presionará la tecla)

---

## 🗂️ Teclas válidas

| Lo que presionas | Lo que se envía |
|---|---|
| F1 – F24 | `f1` … `f24` |
| Letras | `a`, `b`, `c`… |
| Números | `0` – `9` |
| Flechas | `up`, `down`, `left`, `right` |
| Especiales | `enter`, `space`, `escape`, `tab` |
| Numpad | `numpad_0` – `numpad_9` |

---

## 🔧 Configuración avanzada

| Opción | Descripción |
|---|---|
| **Tecla global** | Una sola tecla para TODOS los regalos |
| **Mínimo de monedas** | Ignorar regalos baratos |
| **Cooldown** | Evitar spam (ms entre pulsaciones) |
| **Modo debug** | Ver datos raw de cada regalo en consola |

---

## 📁 Estructura del proyecto

```
tiktok-gift-keys-v2/
├── server.js               ← Servidor principal (Express + Socket.io)
├── config.json             ← Tu config (se crea automáticamente)
├── package.json
├── services/
│   ├── keyboardQueue.js    ← Motor de cola para teclas y sonidos
│   └── alerts.js           ← Gestor de audios
└── frontend/
    └── src/
        └── App.jsx         ← Interfaz gráfica (React)
```

---

## ❓ FAQ

**¿Necesito API key de TikTok?**
No. Usa [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) que se conecta al WebSocket público del live.

**¿Funciona sin estar en live?**
No. La conexión fallará. Debes iniciar el live primero en TikTok (puede ser un live privado de prueba).

**¿Los regalos se guardan?**
Sí, en `config.json`. La próxima vez que abras la app, tus mapeos estarán guardados.

**¿Puede fallar la conexión?**
TikTok a veces bloquea conexiones frecuentes. Espera unos minutos y reintenta.

---

MIT License | Hecho con ❤️
