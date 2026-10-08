package br.pessoal.trajetoria;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reagenda o lembrete depois de reiniciar, atualizar o aplicativo ou mudar a hora. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        boolean relevant = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || "android.intent.action.LOCKED_BOOT_COMPLETED".equals(action);
        if (relevant && ReminderReceiver.enabled(c)) ReminderReceiver.schedule(c);
    }
}
