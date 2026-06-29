const fs = require('fs');
const path = require('path');
const os = require('os');

// 🌟 BUSCADOR INTELIGENTE DE RUTA SEGURA (Evita bloqueos de Windows)
function getStoragePath() {
    const appName = 'REVINITY'; // El nombre de tu programa
    let storagePath;

    if (process.platform === 'win32') {
        // En Windows, guarda en C:\Users\TuUsuario\AppData\Roaming\REVINITY
        // Esta carpeta SIEMPRE tiene permisos de escritura y no se borra al actualizar
        storagePath = path.join(process.env.APPDATA || process.env.ProgramData || os.homedir(), appName);
    } else {
        // Fallback por si lo ejecutas en Mac o Linux
        storagePath = path.join(os.homedir(), `.${appName.toLowerCase()}`);
    }

    // Si la carpeta REVINITY no existe aún, la creamos
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }

    return path.join(storagePath, 'stickers.json');
}

const STICKERS_FILE = getStoragePath();

// 🌟 BASE DE DATOS EN MEMORIA (Súper rápida, 0 delay)
let db = { catalog: {}, assignments: {} };

// Cargar desde AppData SÓLO una vez al arrancar el servidor
if (fs.existsSync(STICKERS_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(STICKERS_FILE, 'utf8'));
        console.log(`🎴 Catálogo de Stickers cargado: ${Object.keys(db.catalog).length} stickers en RAM.`);
        console.log(`📁 Ruta de stickers: ${STICKERS_FILE}`);
    } catch (e) {
        console.error("❌ Error leyendo stickers.json", e);
    }
} else {
    // Si es la primera vez que se abre el bot, lo crea vacío en AppData
    fs.writeFileSync(STICKERS_FILE, JSON.stringify(db, null, 2));
    console.log(`✨ Nueva base de stickers creada en: ${STICKERS_FILE}`);
}

// Función para guardar cambios
function save() {
    try {
        fs.writeFileSync(STICKERS_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("❌ Error guardando stickers.json", e);
    }
}

module.exports = {
    db,    // Objeto en memoria
    save   // Función de guardado
};