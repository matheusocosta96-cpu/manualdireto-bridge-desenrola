import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, isEncryptedBackup, backupFileName } from '../web/storage.js';
import { initialState, complete, validateBackup } from '../web/domain.js';

test('backup cifrado só abre com a senha correta', async () => {
  const state = complete(initialState(), 'read', 'teste', new Date(2026, 9, 8));
  const plain = JSON.stringify(state);
  const sealed = await encryptBackup(plain, 'senha-bem-grande');
  assert.equal(isEncryptedBackup(sealed), true);
  assert.equal(isEncryptedBackup(plain), false);
  assert.equal(sealed.includes('teste'), false, 'o conteúdo não aparece em claro');
  const opened = await decryptBackup(sealed, 'senha-bem-grande');
  assert.deepEqual(validateBackup(JSON.parse(opened)), state);
  await assert.rejects(() => decryptBackup(sealed, 'senha-errada'), /Senha incorreta/);
});

test('nome do arquivo distingue backup cifrado de JSON legível', () => {
  assert.match(backupFileName(false), /^trajetoria-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(backupFileName(true), /^trajetoria-\d{4}-\d{2}-\d{2}\.tjb$/);
});
