import { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  Pressable,
  BackHandler,
} from "react-native";
import { Audio } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, router } from "expo-router";
import { Conta, gerarContas } from "../lib/math";
import { reagendarTodos } from "../lib/alarm";

const VIBRACAO = [0, 800, 400, 800, 400];

export default function AlarmeRingingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contas] = useState<Conta[]>(() => gerarContas(2));
  const [respostas, setRespostas] = useState<string[]>(["", ""]);
  const [erro, setErro] = useState<number | null>(null);
  const somRef = useRef<Audio.Sound | null>(null);

  const acertou = useMemo(
    () =>
      contas.every(
        (c, i) => Number((respostas[i] ?? "").trim()) === c.resposta
      ),
    [contas, respostas]
  );

  useEffect(() => {
    let cancelado = false;

    (async () => {
      activateKeepAwakeAsync("alarme");
      Vibration.vibrate(VIBRACAO, true);
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          require("../assets/notify.mp3"),
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        );
        if (cancelado) {
          await sound.unloadAsync();
          return;
        }
        somRef.current = sound;
      } catch (e) {
        console.warn("erro tocando som", e);
      }
    })();

    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);

    return () => {
      cancelado = true;
      sub.remove();
      Vibration.cancel();
      deactivateKeepAwake("alarme");
      somRef.current?.unloadAsync().catch(() => {});
      somRef.current = null;
    };
  }, []);

  const parar = async () => {
    Vibration.cancel();
    deactivateKeepAwake("alarme");
    await somRef.current?.stopAsync().catch(() => {});
    await somRef.current?.unloadAsync().catch(() => {});
    somRef.current = null;
    await Notifications.dismissAllNotificationsAsync().catch(() => {});
    await reagendarTodos().catch(() => {});
    router.replace("/");
  };

  const verificar = () => {
    for (let i = 0; i < contas.length; i++) {
      if (Number((respostas[i] ?? "").trim()) !== contas[i].resposta) {
        setErro(i);
        return;
      }
    }
    setErro(null);
    parar();
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
  container: {
    flex: 1,
    backgroundColor: "#0b0b0f",
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  titulo: { color: "#fff", fontSize: 40, fontWeight: "700" },
  subtitulo: { color: "#aaa", fontSize: 16, marginTop: 8, marginBottom: 32 },
  contaBox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  conta: { color: "#fff", fontSize: 32, fontWeight: "300", flex: 1 },
  input: {
    width: 120,
    color: "#fff",
    fontSize: 32,
    borderBottomWidth: 2,
    borderBottomColor: "#34AF23",
    paddingVertical: 6,
    textAlign: "center",
  },
  inputErro: { borderBottomColor: "#e53935" },
  botao: {
    marginTop: 16,
    backgroundColor: "#34AF23",
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  botaoInativo: { backgroundColor: "#1a4015" },
  botaoTexto: { color: "#fff", fontSize: 18, fontWeight: "600" },
  erroMsg: { color: "#e53935", marginTop: 16, textAlign: "center" },
  debug: { color: "#333", fontSize: 10, marginTop: 24, textAlign: "center" },
});
