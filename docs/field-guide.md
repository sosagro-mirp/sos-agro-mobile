# Field Guide — SOS Agro 4C Mobile

Technical reference for staff who deploy and support the app in the field.

---

## Installing the APK

### Via EAS download link

1. Run `eas build:list --platform android` to see recent builds and their download URLs.
2. Copy the download URL for the desired build and send it to the device (WhatsApp, email, etc.).
3. On the device, open the link in a browser and tap **Descargar**.
4. Once downloaded, tap the `.apk` file in the notifications or file manager.
5. If prompted, enable **"Instalar desde fuentes desconocidas"** for the browser app:
   - Android 8+: Settings → Apps → [Browser] → Install unknown apps → Allow
6. Tap **Instalar** and wait for the installation to complete.

### Common installation issues

| Error | Probable cause | Solution |
|---|---|---|
| "App no instalada" | Not enough storage or Android version < 10 | Free up storage or check device meets minimum Android 10 requirement |
| "Análisis bloqueado por Play Protect" | Google Play Protect warning on sideloaded APK | Tap "Instalar de todas formas" — the app is safe |
| APK does not open | File corrupted during download | Re-download and verify file size matches |

---

## Using the app offline

### Before going to the field (WiFi recommended)

1. Open the app and log in.
2. Go to **Campañas** (Campaigns).
3. Tap the download icon next to each campaign you will use in the field.
4. Wait for the **"✓ Disponible sin conexión"** badge to appear on each campaign — this confirms the instrument definition is cached locally.

### Starting a visit

A network connection is required to start a new visit. This ensures you always have the latest version of the instrument.

1. Open the campaign (connectivity needed at this step).
2. Tap **Iniciar visita**.
3. Once the visit session is created, you can continue filling the survey without connectivity.

### Filling the survey

- Data is saved automatically every 250 ms — you do not need to tap a save button.
- If the app closes mid-survey (battery, crash, accidental close), your progress is preserved.
- Reopen the app and go to **Borradores** to resume the survey.

### Finishing and syncing

- When you complete the last question, tap **Enviar**.
- The response is queued locally and will sync automatically when connectivity is available.
- You do not need to stay on any screen for sync to happen.

---

## Syncing data

### Automatic sync

Sync starts automatically as soon as the device reconnects to the internet. No action needed.

### Manual sync

1. From the home screen, tap **Sincronización**.
2. Tap **"Sincronizar ahora"**.
3. Watch the **Pendientes** counter — it should decrease as records are uploaded.

### Interpreting sync status

| Status | Meaning |
|---|---|
| Pendientes | Surveys queued locally, not yet sent |
| Sincronizados | Successfully uploaded to the server |
| Con error | Server rejected the data (HTTP 4xx) — requires intervention |

If **Con error** is greater than 0, tap the record to see the error detail and note the **Survey ID**. Contact technical support with this information.

---

## Exporting logs for support

If the app behaves unexpectedly, export the diagnostic logs:

1. On the home screen, tap the greeting text ("Hola, [nombre]") **5 times quickly**.
2. A debug panel will appear.
3. Tap **"Exportar todo"**.
4. Share the exported file via WhatsApp or email to the support contact.

---

## Common issues

| Issue | Probable cause | Solution |
|---|---|---|
| "Instrumento no encontrado en caché" | Instrument cache was cleared (app reinstall, cache purge) | Open the campaign with WiFi and tap "Actualizar" to re-download |
| "Sin conexión para iniciar" | No network at the moment of starting a visit | Move to an area with connectivity, start the visit, then continue offline |
| Survey stuck in "Pendientes" for hours | Backend unreachable or device offline | Wait for stable connectivity, then tap "Sincronizar ahora" |
| Survey in "Con error" | Server rejected submission (validation error, duplicate, etc.) | Contact support with the error detail message and the Survey ID |
| App crashes immediately on open | Corrupted SQLite database | Try force-stopping and reopening. If it persists, reinstall the app (local unsynced data will be lost) or contact support before reinstalling |
| Login fails with "Token expirado" | JWT session expired | Log in again; sessions last 7 days |

---

## Support contact

For technical issues, send the error detail, Survey ID, and exported logs to:

- Email: **santiago8628@gmail.com**
- WhatsApp: *(contact your project coordinator for the current support number)*

Please include:
- Device model and Android version
- App version (visible in Settings → About)
- Step-by-step description of what happened
- Exported log file (see above)
