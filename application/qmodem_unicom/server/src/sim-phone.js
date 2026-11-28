import { createHash } from 'node:crypto';

export function normalizeSimPhone(value) {
  if (typeof value !== 'string') return '';
  let phone = value.replace(/[\s()+-]/g, '');
  if (phone.startsWith('0086')) phone = phone.slice(4);
  else if (phone.startsWith('86')) phone = phone.slice(2);
  return /^1[3-9]\d{9}$/.test(phone) ? phone : '';
}
export function phoneFingerprint(value) {
  const phone = normalizeSimPhone(value);
  return phone ? createHash('sha256').update(phone).digest('hex') : '';
}
function mismatch(sim, entry, phone) {
  const current = normalizeSimPhone(sim?.phone);
  if (!current) return false;
  const saved = normalizeSimPhone(phone);
  if (saved) return current !== saved;
  if (entry?.phoneHash) return phoneFingerprint(current) !== entry.phoneHash;
  // Older Unicom entries retained only a masked number. Clear a definite
  // mismatch, without guessing the hidden digits or treating unknown as wrong.
  return /^1\d{2}\*{4}\d{4}$/.test(entry?.mobile || '') &&
    entry.mobile !== current.slice(0, 3) + '****' + current.slice(-4);
}
export function bindSimPhone(store, phoneOf) {
  if (!store) return store;
  return {
    get(sim) {
      const entry = store.get(sim);
      if (entry && mismatch(sim, entry, phoneOf(entry))) {
        store.remove(sim);
        return null;
      }
      return entry;
    },
    put(sim, credentials, phone) {
      if (mismatch(sim, null, phone || phoneOf({ credentials }))) {
        store.remove(sim);
        throw Object.assign(new Error('登录手机号与当前 SIM 卡号码不一致，请使用当前 SIM 卡重新登录'), { code: 'SIM_PHONE_MISMATCH', statusCode: 409 });
      }
      return store.put(sim, credentials, phone);
    },
    remove(sim) { return store.remove(sim); },
  };
}
