# Alarme Contas

App Android simples: cria alarmes; quando dispara, exige resolver duas contas (+ − × ÷, números 1–100) pra parar.

## Como buildar localmente

A pasta `android/` antiga (do projeto anterior) está como root. Apague antes de gerar o prebuild novo:

```bash
sudo rm -rf android ios
```

Depois:

```bash
docker compose up -d alarme-app          # instala node_modules dentro do container
docker compose exec alarme-app npx expo prebuild --clean --platform android
docker compose exec alarme-app npx expo run:android
```

Ou local (sem Docker), com Node 18+ e Android SDK:

```bash
npm install
npx expo prebuild --clean --platform android
npx expo run:android
```

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
