// Persistência. No Android os dados passam pela ponte Java (gravação cifrada
// com o Android Keystore). No navegador vão para o localStorage, sem cifra —
// a prévia serve para testar a interface, não para guardar dados sensíveis.
import { initialState, validateBackup, SCHEMA_VERSION } from './domain.js';

const KEY = 'trajetoria.v1';

function bridge() {
  return typeof window !== 'undefined' ? window.Android : undefined;
}

export function storageKind() {
  return bridge() ? 'android' : 'browser';
}

export function readRaw() {
  const native = bridge();
  if (native) return native.readState();
  return localStorage.getItem(KEY);
}

export function read() {
  const raw = readRaw();
  if (!raw) return initialState();
  return validateBackup(JSON.parse(raw));
}

export function write(state) {
  const raw = JSON.stringify(state);
  const native = bridge();
  if (native) {
    if (!native.writeState(raw)) throw Error('Não foi possível salvar neste aparelho.');
    return;
  }
  localStorage.setItem(KEY, raw);
}

export function backupFileName(encrypted) {
  return `trajetoria-${new Date().toISOString().slice(0, 10)}${encrypted ? '.tjb' : '.json'}`;
}

// ---------------------------------------------------------------------------
// Backup opcionalmente cifrado com uma senha que só você conhece.
// Formato: JSON com cabeçalho legível + conteúdo AES-GCM derivado por PBKDF2.
// ---------------------------------------------------------------------------

const PBKDF2_ROUNDS = 310000;

function b64(bytes) {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out);
}

function unb64(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

async function derive(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackup(plain, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return JSON.stringify({
    format: 'trajetoria-backup',
    schema: SCHEMA_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ROUNDS },
    cipher: 'AES-GCM',
    salt: b64(salt),
    iv: b64(iv),
    data: b64(new Uint8Array(data))
  }, null, 2);
}

export function isEncryptedBackup(text) {
  try {
    const value = JSON.parse(text);
    return value && value.format === 'trajetoria-backup' && typeof value.data === 'string';
  } catch {
    return false;
  }
}

export async function decryptBackup(text, passphrase) {
  const envelope = JSON.parse(text);
  if (envelope.cipher !== 'AES-GCM' || !envelope.kdf || envelope.kdf.name !== 'PBKDF2') {
    throw Error('Formato de backup cifrado não reconhecido.');
  }
  const salt = unb64(envelope.salt);
  const iv = unb64(envelope.iv);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: envelope.kdf.iterations, hash: envelope.kdf.hash },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64(envelope.data));
  } catch {
    throw Error('Senha incorreta ou arquivo alterado.');
  }
  return new TextDecoder().decode(plain);
}

// Entrega o arquivo: no Android pelo seletor de documentos, no navegador por download.
export function saveBackupFile(text, encrypted) {
  const native = bridge();
  if (native) {
    native.exportBackup(text, backupFileName(encrypted));
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(encrypted);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
