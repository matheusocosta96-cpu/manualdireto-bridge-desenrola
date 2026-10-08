package br.pessoal.trajetoria;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Guarda o estado do aplicativo cifrado com AES-GCM. A chave fica no Android
 * Keystore e nunca sai do aparelho; ao desinstalar, chave e dados somem juntos.
 * Toda gravação mantém a versão anterior em "state.prev" como rede de proteção.
 */
final class Vault {

    private static final String ALIAS = "trajetoria-local-v1";
    private static final String STORE = "vault";
    private static final String CURRENT = "state";
    private static final String PREVIOUS = "state.prev";

    private Vault() { }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private static String decrypt(String value) throws Exception {
        String[] parts = value.split(":", 2);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    /**
     * Devolve o estado em texto, null quando ainda não há nada gravado, ou um
     * objeto de diagnóstico que carrega o bloco cifrado — assim a interface
     * mostra o erro sem que nada seja descartado.
     */
    static String read(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        String value = prefs.getString(CURRENT, null);
        if (value == null) return null;
        try {
            return decrypt(value);
        } catch (Exception first) {
            String previous = prefs.getString(PREVIOUS, null);
            if (previous != null) {
                try {
                    return decrypt(previous);
                } catch (Exception ignored) {
                    // cai no diagnóstico abaixo
                }
            }
            return "{\"vaultError\":\"Não foi possível decifrar os dados deste aparelho.\",\"cipher\":"
                    + org.json.JSONObject.quote(value) + "}";
        }
    }

    static boolean write(Context ctx, String raw) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            SharedPreferences prefs = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
            String current = prefs.getString(CURRENT, null);
            SharedPreferences.Editor editor = prefs.edit().putString(CURRENT, value);
            if (current != null) editor.putString(PREVIOUS, current);
            return editor.commit();
        } catch (Exception ex) {
            return false;
        }
    }
}
