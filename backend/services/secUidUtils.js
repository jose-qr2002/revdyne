function findSecUidDeep(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;

  if (typeof obj.sec_uid === 'string' && obj.sec_uid.length > 0) return obj.sec_uid;
  if (typeof obj.secUid === 'string' && obj.secUid.length > 0) return obj.secUid;

  for (const key of Object.keys(obj)) {
    const found = findSecUidDeep(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

module.exports = { findSecUidDeep };