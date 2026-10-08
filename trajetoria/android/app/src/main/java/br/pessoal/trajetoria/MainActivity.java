package br.pessoal.trajetoria;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Casca nativa do Trajetória: carrega os mesmos arquivos da interface a partir
 * dos assets, guarda o estado cifrado e cuida de notificações e bloqueio.
 * Sem bibliotecas externas — o projeto compila sem baixar dependências.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final long LOCK_AFTER_MS = 30_000L;
    private static final int MAX_PAYLOAD = 10_000_000;

    private static final int REQ_EXPORT = 1;
    private static final int REQ_IMPORT = 2;
    private static final int REQ_UNLOCK = 3;
    private static final int REQ_NOTIFICATIONS = 20;

    private WebView web;
    private String pendingExport;
    private String pendingExportName = "trajetoria-backup.json";
    private boolean loaded = false;
    private boolean unlocking = false;
    private long leftAt = 0L;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        requireCredential(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!loaded || unlocking) return;
        boolean lockOnResume = prefs().getBoolean("lockOnResume", true);
        if (lockOnResume && leftAt > 0 && System.currentTimeMillis() - leftAt > LOCK_AFTER_MS) {
            requireCredential(false);
        } else if (web != null) {
            web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
        }
        leftAt = 0L;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (!unlocking) leftAt = System.currentTimeMillis();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("trajetoria", MODE_PRIVATE);
    }

    /** Pede a credencial do aparelho. Sem bloqueio configurado não há o que pedir. */
    private void requireCredential(boolean firstRun) {
        KeyguardManager lock = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (lock != null && lock.isDeviceSecure()) {
            Intent intent = lock.createConfirmDeviceCredentialIntent(
                    "Trajetória", "Desbloqueie para acessar seus registros pessoais");
            if (intent != null) {
                unlocking = true;
                startActivityForResult(intent, REQ_UNLOCK);
                return;
            }
        }
        if (firstRun) {
            Toast.makeText(this, "Configure um bloqueio de tela para proteger seus dados.", Toast.LENGTH_LONG).show();
            openApp();
        }
    }

    private void openApp() {
        unlocking = false;
        if (loaded) {
            if (web != null) web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
            return;
        }
        loaded = true;
        web = new WebView(this);
        web.setBackgroundColor(0xff101613);
        setContentView(web);

        // Android 15 desenha de ponta a ponta: manter os controles fora das barras.
        web.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                if (Build.VERSION.SDK_INT >= 30) {
                    Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                } else {
                    view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                            insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                }
                return insets;
            }
        });

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);

        web.setWebViewClient(new AssetClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl(ORIGIN + "/");
    }

    /** Serve os assets locais como se viessem de uma origem HTTPS própria. */
    private final class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!HOST.equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.contains("..") || !path.startsWith("/")) return empty(403, "Forbidden");
            String file = path.equals("/") ? "index.html" : path.substring(1);
            try {
                InputStream in = getAssets().open("public/" + file);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                if (file.endsWith(".html")) {
                    headers.put("Content-Security-Policy",
                            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                          + "img-src 'self' data:; font-src 'self'; connect-src https:; "
                          + "form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
                }
                WebResourceResponse response = new WebResourceResponse(mime(file), "UTF-8", 200, "OK", headers, in);
                return response;
            } catch (IOException ex) {
                return empty(404, "Not found");
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !request.getUrl().toString().startsWith(ORIGIN + "/");
        }

        private WebResourceResponse empty(int status, String reason) {
            return new WebResourceResponse("text/plain", "UTF-8", status, reason,
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }

        private String mime(String file) {
            if (file.endsWith(".js")) return "text/javascript";
            if (file.endsWith(".css")) return "text/css";
            if (file.endsWith(".svg")) return "image/svg+xml";
            if (file.endsWith(".json")) return "application/json";
            if (file.endsWith(".png")) return "image/png";
            return "text/html";
        }
    }

    private void callback(final String script) {
        if (web == null) return;
        runOnUiThread(new Runnable() {
            @Override public void run() { web.evaluateJavascript(script, null); }
        });
    }

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled();
    }

    private void activateReminder() {
        boolean allowed = notificationsAllowed();
        prefs().edit().putBoolean("remindersEnabled", allowed).apply();
        if (allowed) ReminderReceiver.schedule(this);
        callback("window.onReminderStatus(" + allowed + ")");
    }

    // -----------------------------------------------------------------------
    // Ponte chamada pela interface
    // -----------------------------------------------------------------------

    final class Bridge {

        @JavascriptInterface
        public String readState() {
            return Vault.read(MainActivity.this);
        }

        @JavascriptInterface
        public boolean writeState(String raw) {
            if (raw == null || raw.length() > MAX_PAYLOAD) return false;
            return Vault.write(MainActivity.this, raw);
        }

        @JavascriptInterface
        public String status() {
            return MainActivity.this.statusJson();
        }

        @JavascriptInterface
        public void setLockOnResume(boolean value) {
            prefs().edit().putBoolean("lockOnResume", value).apply();
        }

        @JavascriptInterface
        public void enableReminders(final String time) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (time != null && time.matches("^([01]\\d|2[0-3]):[0-5]\\d$")) {
                        prefs().edit().putString("nightTime", time).apply();
                    }
                    if (Build.VERSION.SDK_INT >= 33
                            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
                    } else {
                        activateReminder();
                    }
                }
            });
        }

        @JavascriptInterface
        public void disableReminders() {
            prefs().edit().putBoolean("remindersEnabled", false).apply();
            AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarms != null) alarms.cancel(ReminderReceiver.alarm(MainActivity.this));
        }

        @JavascriptInterface
        public void morningReminder() {
            ReminderReceiver.notify(MainActivity.this, 10, "Seu cuidado da manhã",
                    "Confira o lembrete de medicação no aplicativo e confirme quando tomar.");
        }

        @JavascriptInterface
        public void exportBackup(String raw, String name) {
            if (raw == null || raw.length() > MAX_PAYLOAD) return;
            pendingExport = raw;
            pendingExportName = (name != null && name.matches("^[A-Za-z0-9._-]{1,64}$")) ? name : "trajetoria-backup.json";
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                            .setType("application/json")
                            .addCategory(Intent.CATEGORY_OPENABLE)
                            .putExtra(Intent.EXTRA_TITLE, pendingExportName);
                    startActivityForResult(intent, REQ_EXPORT);
                }
            });
        }

        @JavascriptInterface
        public void importBackup() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                            .setType("*/*")
                            .addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, REQ_IMPORT);
                }
            });
        }

        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    if (intent.resolveActivity(getPackageManager()) == null) {
                        intent = appSettingsIntent();
                    }
                    startActivity(intent);
                }
            });
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(new Runnable() {
                @Override public void run() { startActivity(appSettingsIntent()); }
            });
        }
    }

    private Intent appSettingsIntent() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
    }

    /** Estado real do sistema, para a tela de Conexões não prometer o que não existe. */
    private String statusJson() {
        JSONObject out = new JSONObject();
        try {
            out.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            out.put("release", Build.VERSION.RELEASE);
            out.put("sdk", Build.VERSION.SDK_INT);
            out.put("versionName", BuildInfo.VERSION_NAME);
            out.put("notificationsEnabled", notificationsAllowed());

            AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            boolean exact = true;
            if (Build.VERSION.SDK_INT >= 31 && alarms != null) exact = alarms.canScheduleExactAlarms();
            out.put("exactAlarms", exact);

            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            out.put("ignoringBatteryOptimizations",
                    power != null && power.isIgnoringBatteryOptimizations(getPackageName()));

            SharedPreferences p = prefs();
            boolean enabled = p.getBoolean("remindersEnabled", false);
            out.put("nightScheduled", enabled);
            out.put("nextAlarm", enabled ? ReminderReceiver.nextRunLabel(this) : "");
            out.put("nightTime", p.getString("nightTime", "20:00"));

            KeyguardManager lock = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            out.put("deviceSecure", lock != null && lock.isDeviceSecure());
            out.put("healthConnect", packageExists("com.google.android.apps.healthdata"));
        } catch (Exception ex) {
            // Um campo ausente é melhor que uma promessa falsa.
        }
        return out.toString();
    }

    private boolean packageExists(String name) {
        try {
            getPackageManager().getPackageInfo(name, 0);
            return true;
        } catch (PackageManager.NameNotFoundException ex) {
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == REQ_NOTIFICATIONS) activateReminder();
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_UNLOCK) {
            unlocking = false;
            if (result == RESULT_OK) openApp();
            else finish();
            return;
        }
        if (result != RESULT_OK || data == null || data.getData() == null) {
            pendingExport = null;
            return;
        }
        try {
            if (code == REQ_EXPORT && pendingExport != null) {
                OutputStream out = getContentResolver().openOutputStream(data.getData());
                try {
                    out.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                } finally {
                    if (out != null) out.close();
                }
                pendingExport = null;
                Toast.makeText(this, "Backup exportado. Guarde em local privado.", Toast.LENGTH_LONG).show();
            }
            if (code == REQ_IMPORT) {
                InputStream in = getContentResolver().openInputStream(data.getData());
                try {
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    int count;
                    while ((count = in.read(chunk)) != -1) {
                        buffer.write(chunk, 0, count);
                        if (buffer.size() > MAX_PAYLOAD) throw new IOException("Backup muito grande");
                    }
                    String raw = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
                    callback("window.onNativeImport(" + JSONObject.quote(raw) + ")");
                } finally {
                    if (in != null) in.close();
                }
            }
        } catch (Exception ex) {
            pendingExport = null;
            Toast.makeText(this, "Não foi possível acessar o arquivo de backup.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("window.onNativeBack ? window.onNativeBack() : 'exit'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value != null && value.contains("exit")) finish();
            }
        });
    }
}
