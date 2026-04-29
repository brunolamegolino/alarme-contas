import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

export type Alarme = {
  id: string;
  hora: number;
  minuto: number;
  ativo: boolean;
  notificationId?: string;
};

const STORAGE_KEY = "@alarmes";
const NOTIFICATION_CATEGORY = "alarme";
export const NOTIFICATION_CHANNEL_ID = "alarme-channel";

export async function listarAlarmes(): Promise<Alarme[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function salvar(alarmes: Alarme[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarmes));
}

function proximoDisparo(hora: number, minuto: number): Date {
  const agora = new Date();
  const alvo = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate(),
    hora,
    minuto,
    0,
    0
  );
  if (alvo.getTime() <= agora.getTime()) {
    alvo.setDate(alvo.getDate() + 1);
  }
  return alvo;
}

async function agendar(alarme: Alarme): Promise<string> {
  const disparo = proximoDisparo(alarme.hora, alarme.minuto);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "⏰ Alarme!",
      body: "Resolva as contas pra parar o som.",
      sound: "notify.mp3",
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: NOTIFICATION_CATEGORY,
      data: { alarmeId: alarme.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: disparo,
      channelId: NOTIFICATION_CHANNEL_ID,
    },
  });
}

async function cancelar(notificationId?: string) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

export async function criarAlarme(hora: number, minuto: number): Promise<Alarme> {
  const alarmes = await listarAlarmes();
  const alarme: Alarme = {
    id: `${Date.now()}`,
    hora,
    minuto,
    ativo: true,
  };
  alarme.notificationId = await agendar(alarme);
  alarmes.push(alarme);
  await salvar(alarmes);
  return alarme;
}

export async function alternarAlarme(id: string): Promise<Alarme[]> {
  const alarmes = await listarAlarmes();
  const idx = alarmes.findIndex((a) => a.id === id);
  if (idx === -1) return alarmes;
  const alarme = alarmes[idx];
  if (alarme.ativo) {
    await cancelar(alarme.notificationId);
    alarme.ativo = false;
    alarme.notificationId = undefined;
  } else {
    alarme.notificationId = await agendar(alarme);
    alarme.ativo = true;
  }
  alarmes[idx] = alarme;
  await salvar(alarmes);
  return alarmes;
}

export async function removerAlarme(id: string): Promise<Alarme[]> {
  const alarmes = await listarAlarmes();
  const alarme = alarmes.find((a) => a.id === id);
  if (alarme) await cancelar(alarme.notificationId);
  const restantes = alarmes.filter((a) => a.id !== id);
  await salvar(restantes);
  return restantes;
}

export async function reagendarTodos(): Promise<void> {
  const alarmes = await listarAlarmes();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const alarme of alarmes) {
    if (alarme.ativo) {
      alarme.notificationId = await agendar(alarme);
    } else {
      alarme.notificationId = undefined;
    }
  }
  await salvar(alarmes);
}

export function formatarHora(hora: number, minuto: number): string {
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}
