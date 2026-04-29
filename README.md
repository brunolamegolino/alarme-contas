# Alarme Contas

App Android simples: cria alarmes; quando dispara, exige resolver duas contas (+ − × ÷, números 1–100) pra parar.

## Como buildar localmente

A pasta `android/` antiga (do projeto anterior) está como root. Apague antes de gerar o prebuild novo:

```bash
sudo rm -rf android ios
```

Depois (Node 18+ e Android SDK no host):

```bash
npm install
npx expo prebuild --clean --platform android
```

A partir daí, escolhe o caminho:

### Desenvolvimento (rápido, com hot reload)

```bash
npx expo run:android
```

Builda debug, instala no celular conectado e sobe o Metro. Iteração rápida — segundo build leva ~30s–1min.

> Precisa de celular com **depuração USB** ativada e cabo conectado, ou adb wireless pareado.

### APK release (standalone, roda sem PC)

```bash
cd android
./gradlew assembleRelease
```

APK fica em `android/app/build/outputs/apk/release/app-release.apk`.

### APK debug

```bash
cd android
./gradlew assembleDebug
```

APK em `android/app/build/outputs/apk/debug/app-debug.apk`. Mais rápido, mas precisa do Metro rodando pra carregar o JS.

### Atalho: builda release + instala no celular

```bash
npx expo run:android --variant release
```

### Tempos típicos

| | 1º build | builds seguintes |
|---|---|---|
| `expo run:android` (debug) | ~5–10 min | ~30s–1min |
| `assembleRelease` | ~10–15 min | ~2–4 min |

Gradle cacheia tudo em `~/.gradle/caches` — o primeiro build baixa SDK/deps, os seguintes só recompilam o que mudou.

### Transferindo o APK pro celular

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
# ou copia pro /sdcard/Download e instala manualmente:
adb push android/app/build/outputs/apk/release/app-release.apk /sdcard/Download/
```

Também serve mandar pelo Telegram/Drive e abrir no celular (precisa autorizar "fontes desconhecidas").

## Estrutura

- `app/index.tsx` — lista de alarmes, criar/ativar/remover
- `app/alarme.tsx` — tela que dispara o som + 2 contas pra parar
- `app/_layout.tsx` — handler de notificação (abre `/alarme` ao tocar)
- `lib/alarm.ts` — agendamento via `expo-notifications`
- `lib/math.ts` — gerador de contas

## Limites do agendamento

O app usa `expo-notifications` (sem código nativo custom). Isso significa:

- **Quando dispara**: o Android mostra uma notificação de alta prioridade tocando `notify.mp3`. Tocar nela abre a tela `/alarme`, que toca som contínuo + vibra até as duas contas baterem.
- **App fechado**: funciona, desde que o Android permita `SCHEDULE_EXACT_ALARM` (Android 12+ pede permissão extra em *Configurações → Apps → Alarme Contas → Alarmes e lembretes*).
- **Não é um "alarm clock" verdadeiro**: a tela não acende sozinha por cima do lock screen — o usuário precisa tocar na notificação. Pra isso seria necessário código nativo (full-screen intent + `AlarmManager.setAlarmClock`).

Se quiser comportamento de despertador real (acende a tela, toca som contínuo sem precisar tocar na notificação), me avisa que adiciono o módulo nativo.

## Observações

- Som: `assets/notify.mp3` é reaproveitado do projeto anterior. Pra trocar, substitui o arquivo (mesmo nome) e roda prebuild de novo.
- Long-press num alarme da lista → remover.
