const fs = require('fs');
const path = require('path');
const obfuscator = require('javascript-obfuscator');

// Este módulo es llamado automáticamente por electron-builder
exports.default = async function(context) {
    console.log('\n🛡️ [HOOK] Iniciando ofuscación en el empaquetado...');
    
    // context.appOutDir es la carpeta donde Electron está creando el .exe
    // Como tienes "asar: false", el código fuente se copia a "resources/app"
    const appDir = path.join(context.appOutDir, 'resources', 'app');
    
    if (!fs.existsSync(appDir)) {
        console.log('⚠️ Carpeta resources/app no encontrada. Saltando ofuscación.');
        return;
    }

    // 1. Lo que vamos a proteger
    const carpetasAOfuscar = ['backend'];
    const archivosAOfuscar = ['server.js', 'main.js'];

    // 2. Función ofuscadora in-situ (sobreescribe el archivo)
    function ofuscarArchivo(rutaAbsoluta) {
        if (!fs.existsSync(rutaAbsoluta)) return;
        
        const codigoOriginal = fs.readFileSync(rutaAbsoluta, 'utf8');
        const resultado = obfuscator.obfuscate(codigoOriginal, {
            target: 'node', 
            compact: true,
            stringArray: true,
            stringArrayEncoding: ['base64'],
            controlFlowFlattening: false, 
            deadCodeInjection: false 
        });
        
        // Sobreescribimos el archivo ya copiado por Electron
        fs.writeFileSync(rutaAbsoluta, resultado.getObfuscatedCode());
        console.log(`✅ Blindado: ${path.basename(rutaAbsoluta)}`);
    }

    // 3. Procesar Carpetas
    function procesarCarpeta(directorio) {
        if (!fs.existsSync(directorio)) return;
        
        const elementos = fs.readdirSync(directorio);
        elementos.forEach(elemento => {
            const rutaCompleta = path.join(directorio, elemento);
            
            if (fs.statSync(rutaCompleta).isDirectory()) {
                procesarCarpeta(rutaCompleta);
            } else if (rutaCompleta.endsWith('.js')) {
                ofuscarArchivo(rutaCompleta);
            }
        });
    }

    // 4. Ejecución
    archivosAOfuscar.forEach(archivo => {
        ofuscarArchivo(path.join(appDir, archivo));
    });

    carpetasAOfuscar.forEach(carpeta => {
        procesarCarpeta(path.join(appDir, carpeta));
    });

    console.log('🚀 [HOOK] ¡Ofuscación completada exitosamente dentro del paquete!\n');
};