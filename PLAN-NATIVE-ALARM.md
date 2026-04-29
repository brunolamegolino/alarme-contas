# Plano: módulo nativo de alarme (despertador real)

Substitui `expo-notifications`/`expo-av` por código nativo Android pra ter comportamento de despertador de verdade: toca no horário com app fechado, acende a tela por cima do lock screen, som contínuo até resolver as duas contas.

> **Status**: `plugins/with-alarm.js` já está criado. Os Kotlin abaixo precisam ser salvos em `plugins/native/` antes de rodar `npx expo prebuild --clean`.

## Arquitetura

```
[Usuário cria alarme] → JS → AlarmModule.setAlarm(id, timestamp)
                                       ↓
                            AlarmManager.setAlarmClock()
                                       ↓
                          (Android espera até a hora)
                                       ↓
                            AlarmReceiver.onReceive()
                            ├─→ inicia AlarmService (foreground)
                            │     ├─ MediaPlayer toca som de alarme do sistema (loop)
                            │     ├─ Vibrator vibra em padrão
                            │     ├─ WakeLock segura CPU
                            │     └─ Notification full-screen intent
                            │
                            └─→ launches MainActivity
                                  ├─ showWhenLocked + turnScreenOn (manifest)
                                  └─ extra "alarmId" no intent
                                       ↓
                            JS lê alarmId via NativeAlarm.getCurrentAlarmId()
                                       ↓
                            router.push("/alarme") → tela com 2 contas
                                       ↓
                            [Usuário acerta as duas]
                                       ↓
                            JS → AlarmModule.stopAlarm()
                                       ↓
                            Service.stopSelf() → som para, vibração para
                                       ↓
                            JS reagenda próximo disparo (24h depois)
```

## Por que `setAlarmClock` (e não `setExactAndAllowWhileIdle`)

- Privilégio especial do Android pra apps de despertador
- Aparece no indicador "próximo alarme" da tela de bloqueio
- Bypassa Doze mode automaticamente
- Não é afetado por otimização de bateria do app

## Arquivos a criar/modificar

### Criar

```
plugins/with-alarm.js              ✓ já criado
plugins/native/AlarmModule.kt      ← código nativo
plugins/native/AlarmPackage.kt
plugins/native/AlarmReceiver.kt
plugins/native/AlarmService.kt
lib/native-alarm.ts                ← wrapper JS pro módulo
```

### Modificar

```
app.json                           ← registrar plugin + permissões
package.json                       ← remover expo-notifications, expo-av, expo-keep-awake
lib/alarm.ts                       ← usar NativeAlarm em vez de Notifications
app/_layout.tsx                    ← detectar alarmId do intent + checar permissão
app/alarme.tsx                     ← chamar NativeAlarm.stopAlarm(), sem expo-av
```

## Conteúdo dos arquivos

### `plugins/native/AlarmModule.kt`

```kotlin
package __PACKAGE__

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class AlarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AlarmModule"

    @ReactMethod
    fun setAlarm(id: String, timestamp: Double, promise: Promise) {
        try {
            val context = reactApplicationContext
            val triggerIntent = Intent(context, AlarmReceiver::class.java).apply {
                putExtra("alarmId", id)
                action = "ALARM_FIRE_$id"
            }
            val triggerPi = PendingIntent.getBroadcast(
                context, id.hashCode(), triggerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val showIntent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)!!
                .apply { putExtra("alarmId", id) }
            val showPi = PendingIntent.getActivity(
                context, id.hashCode() + 1, showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setAlarmClock(
                AlarmManager.AlarmClockInfo(timestamp.toLong(), showPi),
                triggerPi
            )
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", e)
        }
    }

    @ReactMethod
    fun cancelAlarm(id: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, AlarmReceiver::class.java).apply {
                action = "ALARM_FIRE_$id"
            }
            val pi = PendingIntent.getBroadcast(
                context, id.hashCode(), intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            if (pi != null) {
                (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
                pi.cancel()
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e)
        }
    }

    @ReactMethod
    fun stopAlarm(promise: Promise) {
        try {
            val context = reactApplicationContext
            context.getSharedPreferences("alarmes", Context.MODE_PRIVATE)
                .edit().remove("ringingAlarmId").apply()
            context.stopService(Intent(context, AlarmService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e)
        }
    }

    @ReactMethod
    fun getCurrentAlarmId(promise: Promise) {
        val prefs = reactApplicationContext
            .getSharedPreferences("alarmes", Context.MODE_PRIVATE)
        promise.resolve(prefs.getString("ringingAlarmId", null))
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        val am = reactApplicationContext
            .getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            promise.resolve(am.canScheduleExactAlarms())
        } else promise.resolve(true)
    }

    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            val context = reactApplicationContext
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.startActivity(
                    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        data = Uri.parse("package:${context.packageName}")
                    }
                )
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e)
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
```

### `plugins/native/AlarmPackage.kt`

```kotlin
package __PACKAGE__

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AlarmPackage : ReactPackage {
    override fun createNativeModules(c: ReactApplicationContext): List<NativeModule> =
        listOf(AlarmModule(c))
    override fun createViewManagers(c: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```

### `plugins/native/AlarmReceiver.kt`

```kotlin
package __PACKAGE__

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra("alarmId") ?: return

        context.getSharedPreferences("alarmes", Context.MODE_PRIVATE)
            .edit().putString("ringingAlarmId", alarmId).apply()

        ContextCompat.startForegroundService(
            context,
            Intent(context, AlarmService::class.java).putExtra("alarmId", alarmId)
        )

        val mainIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)!!
            .apply {
                putExtra("alarmId", alarmId)
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
            }
        context.startActivity(mainIntent)
    }
}
```

### `plugins/native/AlarmService.kt`

```kotlin
package __PACKAGE__

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.*
import androidx.core.app.NotificationCompat

class AlarmService : Service() {
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification())
        acquireWakeLock()
        startSound()
        startVibration()
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)!!
        val pi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("⏰ Alarme")
            .setContentText("Resolva as contas pra parar")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "Alarme", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alarme:wl").apply {
            setReferenceCounted(false)
            acquire(10 * 60 * 1000L)
        }
    }

    private fun startSound() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            player = MediaPlayer().apply {
                setDataSource(this@AlarmService, uri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun startVibration() {
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager)
                .defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        val pattern = longArrayOf(0, 800, 400, 800, 400)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION") vibrator?.vibrate(pattern, 0)
        }
    }

    override fun onDestroy() {
        try { player?.stop(); player?.release() } catch (_: Exception) {}
        player = null
        vibrator?.cancel(); vibrator = null
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "alarme-foreground"
        const val NOTIF_ID = 4242
    }
}
```

### `lib/native-alarm.ts`

```ts
import { NativeModules } from "react-native";

const { AlarmModule } = NativeModules;

export const NativeAlarm = {
  setAlarm: (id: string, timestamp: number): Promise<void> =>
    AlarmModule.setAlarm(id, timestamp),
  cancelAlarm: (id: string): Promise<void> =>
    AlarmModule.cancelAlarm(id),
  stopAlarm: (): Promise<void> =>
    AlarmModule.stopAlarm(),
  getCurrentAlarmId: (): Promise<string | null> =>
    AlarmModule.getCurrentAlarmId(),
  canScheduleExactAlarms: (): Promise<boolean> =>
    AlarmModule.canScheduleExactAlarms(),
  openExactAlarmSettings: (): Promise<void> =>
    AlarmModule.openExactAlarmSettings(),
};
```

### `lib/alarm.ts` (rewrite)

Substituir o arquivo atual por:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeAlarm } from "./native-alarm";

export type Alarme = {
  id: string;
  hora: number;
  minuto: number;
  ativo: boolean;
};

const STORAGE_KEY = "@alarmes";

export async function listarAlarmes(): Promise<Alarme[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function salvar(alarmes: Alarme[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarmes));
}

function proximoDisparo(hora: number, minuto: number): number {
  const agora = new Date();
  const alvo = new Date(
    agora.getFullYear(), agora.getMonth(), agora.getDate(),
    hora, minuto, 0, 0
  );
  if (alvo.getTime() <= agora.getTime()) {
    alvo.setDate(alvo.getDate() + 1);
  }
  return alvo.getTime();
}

export async function criarAlarme(hora: number, minuto: number): Promise<Alarme> {
  const alarmes = await listarAlarmes();
  const alarme: Alarme = { id: `${Date.now()}`, hora, minuto, ativo: true };
  await NativeAlarm.setAlarm(alarme.id, proximoDisparo(hora, minuto));
  alarmes.push(alarme);
  await salvar(alarmes);
  return alarme;
}

export async function alternarAlarme(id: string): Promise<Alarme[]> {
  const alarmes = await listarAlarmes();
  const idx = alarmes.findIndex((a) => a.id === id);
  if (idx === -1) return alarmes;
  const a = alarmes[idx];
  if (a.ativo) {
    await NativeAlarm.cancelAlarm(a.id);
    a.ativo = false;
  } else {
    await NativeAlarm.setAlarm(a.id, proximoDisparo(a.hora, a.minuto));
    a.ativo = true;
  }
  alarmes[idx] = a;
  await salvar(alarmes);
  return alarmes;
}

export async function removerAlarme(id: string): Promise<Alarme[]> {
  const alarmes = await listarAlarmes();
  const a = alarmes.find((x) => x.id === id);
  if (a) await NativeAlarm.cancelAlarm(a.id);
  const restantes = alarmes.filter((x) => x.id !== id);
  await salvar(restantes);
  return restantes;
}

export async function reagendarTodos(): Promise<void> {
  const alarmes = await listarAlarmes();
  for (const a of alarmes) {
    if (a.ativo) {
      await NativeAlarm.setAlarm(a.id, proximoDisparo(a.hora, a.minuto));
    }
  }
}

export function formatarHora(hora: number, minuto: number): string {
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}
```

### `app/_layout.tsx` (rewrite)

```tsx
import { Stack, router } from "expo-router";
import { useEffect } from "react";
import { AppState, Alert } from "react-native";
import { NativeAlarm } from "../lib/native-alarm";

async function checarPermissaoExata() {
  const ok = await NativeAlarm.canScheduleExactAlarms();
  if (!ok) {
    Alert.alert(
      "Permissão necessária",
      "O app precisa de permissão pra agendar alarmes exatos. Abrir configurações?",
      [
        { text: "Depois", style: "cancel" },
        { text: "Abrir", onPress: () => NativeAlarm.openExactAlarmSettings() },
      ]
    );
  }
}

async function checarAlarmeTocando() {
  const id = await NativeAlarm.getCurrentAlarmId();
  if (id) router.replace({ pathname: "/alarme", params: { id } });
}

export default function Layout() {
  useEffect(() => {
    checarPermissaoExata();
    checarAlarmeTocando();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checarAlarmeTocando();
    });
    return () => sub.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0b0b0f" },
        headerTintColor: "#fff",
        contentStyle: { backgroundColor: "#0b0b0f" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Alarmes" }} />
      <Stack.Screen
        name="alarme"
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack>
  );
}
```

### `app/alarme.tsx` (rewrite — sem expo-av/expo-keep-awake, som rola via service nativo)

```tsx
import { useMemo, useState } from "react";
import {
  StyleSheet, Text, TextInput, View, Pressable, BackHandler,
} from "react-native";
import { useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Conta, gerarContas } from "../lib/math";
import { reagendarTodos } from "../lib/alarm";
import { NativeAlarm } from "../lib/native-alarm";

export default function AlarmeRingingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contas] = useState<Conta[]>(() => gerarContas(2));
  const [respostas, setRespostas] = useState<string[]>(["", ""]);
  const [erro, setErro] = useState<number | null>(null);

  const acertou = useMemo(
    () => contas.every((c, i) => Number((respostas[i] ?? "").trim()) === c.resposta),
    [contas, respostas]
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const verificar = async () => {
    for (let i = 0; i < contas.length; i++) {
      if (Number((respostas[i] ?? "").trim()) !== contas[i].resposta) {
        setErro(i);
        return;
      }
    }
    await NativeAlarm.stopAlarm();
    await reagendarTodos();
    router.replace("/");
  };

  const setResposta = (i: number, v: string) => {
    setRespostas((prev) => {
      const next = [...prev];
      next[i] = v.replace(/[^\d-]/g, "");
      return next;
    });
    if (erro === i) setErro(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>⏰ Alarme</Text>
      <Text style={styles.subtitulo}>Resolva as duas contas pra parar</Text>

      {contas.map((c, i) => (
        <View key={i} style={styles.contaBox}>
          <Text style={styles.conta}>{c.enunciado} =</Text>
          <TextInput
            style={[styles.input, erro === i && styles.inputErro]}
            value={respostas[i]}
            onChangeText={(v) => setResposta(i, v)}
            keyboardType="number-pad"
            placeholder="?"
            placeholderTextColor="#444"
            autoFocus={i === 0}
          />
        </View>
      ))}

      <Pressable
        style={[styles.botao, !acertou && styles.botaoInativo]}
        onPress={verificar}
      >
        <Text style={styles.botaoTexto}>Parar alarme</Text>
      </Pressable>

      {erro !== null && (
        <Text style={styles.erroMsg}>Resposta {erro + 1} está errada</Text>
      )}
      {id && <Text style={styles.debug}>id: {id}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingTop: 80, paddingHorizontal: 32 },
  titulo: { color: "#fff", fontSize: 40, fontWeight: "700" },
  subtitulo: { color: "#aaa", fontSize: 16, marginTop: 8, marginBottom: 32 },
  contaBox: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  conta: { color: "#fff", fontSize: 32, fontWeight: "300", flex: 1 },
  input: {
    width: 120, color: "#fff", fontSize: 32,
    borderBottomWidth: 2, borderBottomColor: "#34AF23",
    paddingVertical: 6, textAlign: "center",
  },
  inputErro: { borderBottomColor: "#e53935" },
  botao: {
    marginTop: 16, backgroundColor: "#34AF23",
    paddingVertical: 18, borderRadius: 12, alignItems: "center",
  },
  botaoInativo: { backgroundColor: "#1a4015" },
  botaoTexto: { color: "#fff", fontSize: 18, fontWeight: "600" },
  erroMsg: { color: "#e53935", marginTop: 16, textAlign: "center" },
  debug: { color: "#333", fontSize: 10, marginTop: 24, textAlign: "center" },
});
```

### `app.json` (mudanças)

Adicionar o plugin local na lista de plugins (substitui `expo-notifications`):

```json
"plugins": [
  "expo-router",
  "./plugins/with-alarm.js",
  [
    "expo-build-properties",
    {
      "android": {
        "compileSdkVersion": 35,
        "targetSdkVersion": 35
      }
    }
  ]
]
```

Adicionar permissões na lista `android.permissions` (mantém as que já tem, adiciona):

```
"android.permission.FOREGROUND_SERVICE",
"android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
```

### `package.json` (mudanças)

Remover deps que não são mais usadas:

```diff
-    "expo-av": "~15.0.2",
-    "expo-keep-awake": "~14.0.3",
-    "expo-notifications": "~0.29.14",
```

## Passos pra executar (depois)

```bash
# 1. Limpa o prebuild antigo (root-owned)
sudo rm -rf android ios

# 2. Reinstala deps (pra remover expo-notifications etc.)
rm -rf node_modules package-lock.json
npm install

# 3. Roda prebuild — o config plugin injeta os Kotlin no android/
npx expo prebuild --clean --platform android

# 4. Builda e instala
npx expo run:android
# ou pra APK release standalone:
cd android && ./gradlew assembleRelease
```

## Após instalar, testar

1. Abrir o app → vai pedir permissão de "Alarmes e lembretes" (Android 12+) → permitir
2. Criar alarme pra 1 minuto à frente
3. **Fechar o app** (swipe-out, não só botão home — força saída mesmo)
4. Bloquear a tela
5. Esperar disparar:
   - Tela acende sozinha
   - Som de alarme do sistema toca em loop
   - Aparece a tela com 2 contas por cima do lock screen
   - Vibra
6. Resolver as contas → som para → volta pra lista de alarmes

## Pontos de atenção

- **Boot do celular**: alarmes são perdidos quando reinicia o aparelho. Pra v2, adicionar `BootReceiver` que lê `AsyncStorage` (via `SharedPreferences` ou via JS reagendar no startup — o app já chama `reagendarTodos()` no fluxo do alarme parar).
- **MIUI/Xiaomi**: precisa habilitar "Auto-start" e desabilitar otimização de bateria pro app, senão o sistema mata o service.
- **Som**: usa o tom de alarme padrão do sistema (`RingtoneManager.TYPE_ALARM`). Pra customizar, copiar arquivo pra `android/app/src/main/res/raw/alarme.mp3` (via plugin) e trocar a URI no `AlarmService.startSound()`.
- **prebuild --clean**: desde que o config plugin esteja em `app.json`, ele re-injeta tudo a cada prebuild. Os Kotlin em `plugins/native/` são source of truth, não os copiados em `android/`.

## Recapitulando o que muda no comportamento

| | Antes (expo-notifications) | Depois (módulo nativo) |
|---|---|---|
| Som no horário | Notificação curta, fácil de perder | Som contínuo, alto, padrão "alarme" |
| Tela acende? | Não | Sim, automaticamente |
| Sobre lock screen? | Não | Sim |
| Como interrompe? | Tapping na notif → app abre → solve | Já abre direto → solve |
| Som para com app fechado? | N/A (não toca) | Sim, foreground service garante |
| Indicador "próximo alarme" | Não aparece | Aparece (privilégio do `setAlarmClock`) |
