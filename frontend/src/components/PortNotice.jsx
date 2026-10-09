import React from 'react';
import Icon from './Icon';
import { DEFAULT_PORT, currentAppPort } from './portUtils';

// Aviso informativo cuando la app no pudo usar su puerto por defecto (lo ocupaba otro programa) y arrancó en otro
export default function PortNotice() {
  const port = currentAppPort();
  if (import.meta.env.DEV || port === DEFAULT_PORT) return null; // en desarrollo el puerto lo eliges tú
  return (
    <p className="lk-warn">
      <Icon name="alert" size={15} /> El puerto {DEFAULT_PORT} estaba ocupado por otro programa, así que Revdyne está usando el <strong>{port}</strong>.
      Los overlays de Live Studio y OBS lo encuentran solos; solo si alguno se queda en blanco, vuelve a copiar su enlace.
    </p>
  );
}
