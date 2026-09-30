export function normalizeTicket(value) {
  const raw = String(value).trim();
  if (!/^[0-9]{1,12}$/.test(raw)) throw new Error('El volante debe contener de 1 a 12 números, sin letras ni espacios.');
  return raw.replace(/^0+(?=\d)/, '');
}
export function username(value) {
  const clean = String(value).trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(clean)) throw new Error('El usuario debe tener de 3 a 24 letras, números o guion bajo.');
  return clean;
}
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations,hash:'SHA-256'},key,256));
}
export async function makePassword(password) {
  const passwordSalt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordIterations = 210000;
  return {passwordSalt,passwordIterations,passwordHash:await derivePassword(password,passwordSalt,passwordIterations)};
}
export async function checkPassword(password, record) {
  if (!record || !/^[0-9a-f]{32}$/.test(record.passwordSalt) || !/^[0-9a-f]{64}$/.test(record.passwordHash) || record.passwordIterations !== 210000) return false;
  const calculated = await derivePassword(password,record.passwordSalt,record.passwordIterations);
  let diff=0; for(let i=0;i<calculated.length;i++) diff |= calculated.charCodeAt(i)^record.passwordHash.charCodeAt(i);
  return diff===0;
}
export function choosePrize(prizes, manual = '', customWeights = null) {
  const active = Object.keys(prizes).filter(key => prizes[key].enabled);
  if (!active.length) throw new Error('Activa por lo menos un premio.');
  if (manual) {
    if (!active.includes(manual)) throw new Error('El premio seleccionado ya no está activo.');
    return manual;
  }

  // Verificar si hay pesos de probabilidad configurados en localStorage o pasados explícitamente
  let weights = customWeights;
  if (!weights && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('vipizza_custom_weights_v2');
      if (saved) weights = JSON.parse(saved);
    } catch (_) {}
  }

  // Si hay pesos personalizados, aplicar selección probabilística ponderada
  if (weights && typeof weights === 'object') {
    let totalWeight = 0;
    for (const key of active) {
      const w = Math.max(0, Number(weights[key]) || 0);
      totalWeight += w;
    }

    if (totalWeight > 0) {
      let randomVal = Math.random() * totalWeight;
      for (const key of active) {
        const w = Math.max(0, Number(weights[key]) || 0);
        if (w <= 0) continue;
        if (randomVal < w) return key;
        randomVal -= w;
      }
      return active[active.length - 1];
    }
  }

  // Comportamiento equitativo estándar si no hay pesos personalizados
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const max = Math.floor(4294967296 / active.length) * active.length;
    const random = new Uint32Array(1);
    do { crypto.getRandomValues(random); } while (random[0] >= max);
    return active[random[0] % active.length];
  }
  return active[Math.floor(Math.random() * active.length)];
}
export function rotationFor(index, current = 0) {
  const target = ((360 - (index * 30 + 15)) % 360);
  return current + 360 * 6 + ((target - current % 360 + 360) % 360);
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
