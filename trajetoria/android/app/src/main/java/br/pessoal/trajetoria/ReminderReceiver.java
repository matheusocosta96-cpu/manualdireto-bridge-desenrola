package br.pessoal.trajetoria;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Lembretes de medicação. O horário vem da prescrição informada pelo usuário —
 * o aplicativo não sugere nem altera horários. Dispensar a notificação não
 * registra a tomada: a confirmação acontece sempre dentro do aplicativo.
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String PREFS = "trajetoria";
    private static final String CHANNEL = "care";
    private static final int NIGHT_ID = 20;
    private static final int REQUEST = 20;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("remindersEnabled", false);
    }

    static PendingIntent alarm(Context c) {
        Intent intent = new Intent(c, ReminderReceiver.class).setAction("br.pessoal.trajetoria.NIGHT");
        return PendingIntent.getBroadcast(c, REQUEST, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c) {
        String time = prefs(c).getString("nightTime", "20:00");
        int hour = 20;
        int minute = 0;
        try {
            hour = Integer.parseInt(time.substring(0, 2));
            minute = Integer.parseInt(time.substring(3, 5));
        } catch (Exception ignored) {
            // mantém 20:00 se a preferência estiver corrompida
        }
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);

        AlarmManager alarms = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long when = next.getTimeInMillis();
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        if (exact) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarm(c));
        } else {
            // Sem permissão de alarme exato o sistema pode atrasar o lembrete.
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarm(c));
        }
        prefs(c).edit().putLong("nextAlarm", when).apply();
    }

    static String nextRunLabel(Context c) {
        long when = prefs(c).getLong("nextAlarm", 0L);
        if (when <= 0) return "";
        return new SimpleDateFormat("dd/MM 'às' HH:mm", new Locale("pt", "BR")).format(new Date(when));
    }

    static void notify(Context c, int id, String title, String text) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager manager = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Lembretes de cuidado", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Lembretes de medicação conforme a sua prescrição.");
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);

        PendingIntent open = PendingIntent.getActivity(c, 0,
                new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_app)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build();
        manager.notify(id, notification);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (!enabled(c)) return;
        notify(c, NIGHT_ID, "Seu cuidado da noite",
                "Abra o aplicativo e confirme a medicação quando tomar. Esta notificação não registra nada sozinha.");
        schedule(c);
    }
}
