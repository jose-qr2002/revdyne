// Secciones de la aplicación. Se muestran en el sidebar (agrupadas) y su título aparece en la cabecera.
// Para añadir una sección: agregar aquí { id, label, icon } y su render en App.jsx (activeTab === id).
export const NAV_GROUPS = [
  {
    label: null, // el primer grupo no lleva título
    items: [
      { id: 'events', label: 'Eventos', icon: 'link' },
      { id: 'actions', label: 'Acciones', icon: 'sliders' },
      { id: 'catalog', label: 'Regalos TikTok', icon: 'gift' },
      { id: 'stickers', label: 'Stickers', icon: 'image' },
    ],
  },
  {
    label: 'Voz',
    items: [
      { id: 'tts', label: 'Bot TTS', icon: 'volume' },
      { id: 'engines', label: 'Motores de voz', icon: 'mic' },
    ],
  },
  {
    label: 'Transmisión',
    items: [
      { id: 'overlays', label: 'Overlays', icon: 'layers' },
      { id: 'rankings', label: 'Top 10', icon: 'crown' },
      { id: 'log', label: 'Log en vivo', icon: 'list' },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);
