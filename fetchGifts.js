const fs = require('fs');
const path = require('path');

const TIKTOK_GIFT_API = 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988';

async function extraerRegalos() {
    console.log(`🔄 Poniéndonos el disfraz de hacker y conectando a TikTok...`);
    
    try {
        // 1. Hacemos la petición con "Disfraz" (Headers de un navegador real)
        const response = await fetch(TIKTOK_GIFT_API, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error en la red de TikTok: ${response.status}`);
        }

        // 2. Leemos la respuesta como texto primero por si TikTok nos manda HTML o vacío
        const textData = await response.text();
        
        if (!textData || textData.trim() === '') {
            console.log('❌ TikTok nos devolvió una página en blanco. Nos detectó el Anti-Bot.');
            process.exit(1);
        }

        // 3. Ahora sí lo convertimos a JSON de forma segura
        const json = JSON.parse(textData);
        const gifts = json.data?.gifts || [];
        
        if (gifts.length === 0) {
            console.log('❌ El JSON está bien, pero no hay regalos. TikTok movió la bóveda.');
            process.exit(1);
        }

        console.log(`📦 ¡BINGO! Burlamos la seguridad y descargamos ${gifts.length} regalos.`);
        console.log(`💉 Inyectando en tu config.json...`);

        const configPath = path.join(__dirname, 'config.json');
        let config = { giftMappings: {} }; // Por defecto por si el archivo está dañado
        
        // 4. Leer config.json de forma segura (para evitar el mismo error localmente)
        if (fs.existsSync(configPath)) {
            const configText = fs.readFileSync(configPath, 'utf8');
            if (configText.trim() !== '') {
                config = JSON.parse(configText);
            }
        }

        if (!config.giftMappings) config.giftMappings = {};

        let nuevos = 0;

        gifts.forEach(gift => {
            const giftId = String(gift.id);
            if (!config.giftMappings[giftId]) {
                nuevos++;
                config.giftMappings[giftId] = {
                    name: gift.name || `Regalo ${giftId}`,
                    coins: gift.diamond_count || 0,
                    key: '',
                    modifier: 'none',
                    enabled: true,
                    icon: gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || ''
                };
            }
        });

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`🎉 ¡Extracción Perfecta! Se añadieron ${nuevos} regalos nuevos a tu panel.`);
        
    } catch (error) {
        console.error('❌ Error fatal al extraer:', error.message);
    }
}

extraerRegalos();