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
        
        // 👇👇👇 CAMBIO CLAVE: Apuntamos al nuevo catálogo limpio en la raíz 👇👇👇
        console.log(`💉 Inyectando en tu catalog.json...`);

        const ROOT_DIR = process.cwd();
        const catalogPath = path.join(ROOT_DIR, 'catalog.json');
        let catalogData = {}; 
        
        // 4. Leer catalog.json de forma segura si ya existe
        if (fs.existsSync(catalogPath)) {
            const catalogText = fs.readFileSync(catalogPath, 'utf8');
            if (catalogText.trim() !== '') {
                catalogData = JSON.parse(catalogText);
            }
        }

        let nuevos = 0;

        gifts.forEach(gift => {
            const giftId = String(gift.id);
            if (!catalogData[giftId]) {
                nuevos++;
                // Guardamos únicamente la data informativa del regalo, sin configuraciones
                catalogData[giftId] = {
                    name: gift.name || `Regalo ${giftId}`,
                    coins: gift.diamond_count || 0,
                    icon: gift.image?.url_list?.[0] || gift.icon?.url_list?.[0] || ''
                };
            }
        });

        // 5. Guardamos directamente en catalog.json
        fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2));
        
        console.log(`🎉 ¡Extracción Perfecta! Tu catalog.json tiene ${Object.keys(catalogData).length} regalos mapeados (${nuevos} nuevos).`);
        
    } catch (error) {
        console.error('❌ Error fatal al extraer:', error.message);
    }
}

extraerRegalos();