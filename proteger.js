const fs = require('fs');
const path = require('path');
const obfuscator = require('javascript-obfuscator');

// 1. Lo que vamos a proteger
const carpetas = ['routes', 'services', 'config'];
const archivos = ['server.js', 'main.js']; // Tus archivos principales
const carpetaSalida = 'dist-backend';

// 2. Limpiar carpeta anterior
if (fs.existsSync(carpetaSalida)) fs.rmSync(carpetaSalida, { recursive: true, force: true });
fs.mkdirSync(carpetaSalida);

// 3. El motor de ofuscación
function ofuscarArchivo(rutaOrigen, rutaDestino) {
    const codigoOriginal = fs.readFileSync(rutaOrigen, 'utf8');
    const resultado = obfuscator.obfuscate(codigoOriginal, {
        target: 'node', // 🟢 VITAL: Le dice que es código de servidor, para no romper 'require' ni '__dirname'
        compact: true,
        stringArray: true,           // Sigue ocultando tus textos y rutas
        stringArrayEncoding: ['base64'],
        // 🔴 APAGAMOS ESTOS DOS en el backend porque rompen la conexión a TikTok
        controlFlowFlattening: false, 
        deadCodeInjection: false     
    });
    
    fs.mkdirSync(path.dirname(rutaDestino), { recursive: true });
    fs.writeFileSync(rutaDestino, resultado.getObfuscatedCode());
    console.log(`✅ Blindado: ${rutaOrigen}`);
}

// 4. Procesar Archivos
archivos.forEach(archivo => {
    if (fs.existsSync(archivo)) ofuscarArchivo(archivo, path.join(carpetaSalida, archivo));
});

// 5. Procesar Carpetas
function procesarCarpeta(directorio) {
    const elementos = fs.readdirSync(directorio);
    elementos.forEach(elemento => {
        const rutaCompleta = path.join(directorio, elemento);
        const esDirectorio = fs.statSync(rutaCompleta).isDirectory();
        
        if (esDirectorio) {
            procesarCarpeta(rutaCompleta);
        } else if (rutaCompleta.endsWith('.js')) {
            ofuscarArchivo(rutaCompleta, path.join(carpetaSalida, rutaCompleta));
        } else {
            // Si hay archivos que no son código (ej. un JSON de configuración interna) solo se copian
            const rutaDestino = path.join(carpetaSalida, rutaCompleta);
            fs.mkdirSync(path.dirname(rutaDestino), { recursive: true });
            fs.copyFileSync(rutaCompleta, rutaDestino);
        }
    });
}


carpetas.forEach(carpeta => {
    if (fs.existsSync(carpeta)) procesarCarpeta(carpeta);
});

console.log('🚀 ¡Backend ofuscado con éxito en la carpeta /dist-backend!');


// 6. Copiar archivos estáticos para que no se rompan las rutas
const destFrontend = path.join(carpetaSalida, 'frontend', 'dist');
fs.mkdirSync(destFrontend, { recursive: true });
fs.cpSync('frontend/dist', destFrontend, { recursive: true });

// 👇 NUEVO: Copiar la carpeta de sonidos
const destSounds = path.join(carpetaSalida, 'sounds');
if (fs.existsSync('sounds')) {
    fs.mkdirSync(destSounds, { recursive: true });
    fs.cpSync('sounds', destSounds, { recursive: true });
}

if (fs.existsSync('config.json')) {
    fs.copyFileSync('config.json', path.join(carpetaSalida, 'config.json'));
}

console.log('📦 Frontend y Configuración copiados a dist-backend correctamente.');