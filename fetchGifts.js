const { WebcastPushConnection } = require('tiktok-live-connector');
const fs = require('fs');
const path = require('path');

// 💡 IMPORTANTE: Pon aquí el @usuario de CUALQUIER persona que esté transmitiendo en vivo AHORA MISMO.
// (Puede ser un streamer famoso al azar, solo necesitamos "entrar" a una sala para pedir el catálogo).
const username = 'elcriss___'; 

const connection = new WebcastPushConnection(username, { enableExtendedGiftInfo: true });

console.log(`🔄 Conectando a la sala de @${username} para robar... digo, extraer el catálogo...`);

connection.connect().then(async state => {
    console.log(`✅ Conectado. Descargando la lista global de regalos de TikTok...`);
    
    try {
        // Esta es la función mágica de la librería
        const gifts = await connection.getAvailableGifts();
        console.log(`📦 ¡Se descargaron ${gifts.length} regalos! Inyectando en tu config.json...`);

        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        gifts.forEach(gift => {
            const giftId = String(gift.id);
            // Solo lo agregamos si no lo tienes ya configurado
            if (!config.giftMappings[giftId]) {
                config.giftMappings[giftId] = {
                    name: gift.name,
                    coins: gift.diamond_count,
                    key: '',
                    modifier: 'none',
                    enabled: true,
                    icon: gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || ''
                };
            }
        });

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('🎉 ¡Éxito! Tu config.json ahora tiene todos los regalos de TikTok.');
        process.exit();
        
    } catch (error) {
        console.error('❌ Error al extraer (Si dice 403, TikTok bloqueó la petición. Intenta más tarde):', error.message);
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Error de conexión inicial:', err.message);
    process.exit(1);
});