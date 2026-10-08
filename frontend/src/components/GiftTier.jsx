import React from 'react';
import Icon from './Icon';
import { giftTier } from './giftUtils';

// Ícono de nivel de un regalo según sus monedas (ver giftUtils.js)
export default function GiftTierIcon({ coins, size = 20 }) {
  const t = giftTier(coins);
  return <span className="gift-tier" style={{ color: t.color }}><Icon name={t.icon} size={size} /></span>;
}
