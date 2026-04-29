import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { NOTIFICATION_CHANNEL_ID } from "../lib/alarm";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: false,
  }),
});

async function configurarAndroid() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: "Alarme",
    importance: Notifications.AndroidImportance.MAX,
    sound: "notify.mp3",
    vibrationPattern: [0, 500, 250, 500],
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
    enableLights: true,
    showBadge: false,
  });
}

async function pedirPermissao() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync({
      android: {},
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
  }
}

export default function Layout() {
  useEffect(() => {
    configurarAndroid();
    pedirPermissao();

    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const alarmeId = res.notification.request.content.data?.alarmeId as
        | string
        | undefined;
      if (alarmeId) {
        router.push({ pathname: "/alarme", params: { id: alarmeId } });
      }
    });

    Notifications.getLastNotificationResponseAsync().then((res) => {
      const alarmeId = res?.notification?.request?.content?.data?.alarmeId as
        | string
        | undefined;
      if (alarmeId) {
        router.push({ pathname: "/alarme", params: { id: alarmeId } });
      }
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
