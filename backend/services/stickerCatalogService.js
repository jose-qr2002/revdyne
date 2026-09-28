function extractStickerEntries(responseJson) {
  const entries = [];
  const data = responseJson?.data || {};

  const pushList = (list, category) => {
    (list || []).forEach(item => {
      const emoteId = item.emote_id;
      if (!emoteId) return;
      const url = item.image?.url_list?.[0] || '';
      const filename = (item.image?.uri || '').split('/').pop() || emoteId;
      const name = filename.replace(/\.(png|webp|gif|jpg)$/i, '');
      entries.push({ id: emoteId, name, icon: url, category });
    });
  };

  pushList(data.fans_emote_detail?.emote_config?.default_emote_list, 'tiktok');
  pushList(data.fans_emote_detail?.fans_emote_detail?.emote_list, 'fanclub');
  pushList(data.super_fan_emote_detail?.fans_emote_detail?.emote_list, 'superfan');

  return entries;
}

async function fetchStickerCatalog(secUid, auth = {}) {
  const url = `https://webcast.tiktok.com/webcast/sub/privilege/get_sub_emote_detail?aid=1988&sec_anchor_id=${encodeURIComponent(secUid)}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  };

  if (auth.sessionId) {
    const cookieParts = [`sessionid=${auth.sessionId}`];
    if (auth.ttTargetIdc) cookieParts.push(`tt-target-idc=${auth.ttTargetIdc}`);
    headers['Cookie'] = cookieParts.join('; ');
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TikTok respondió ${response.status} al pedir el catálogo de stickers`);
  }

  const json = await response.json();
  if (json.status_code && json.status_code !== 0) {
    throw new Error(`TikTok devolvió status_code ${json.status_code}${!auth.sessionId ? ' (probablemente requiere sesión iniciada)' : ''}`);
  }

  return extractStickerEntries(json);
}

module.exports = { fetchStickerCatalog };