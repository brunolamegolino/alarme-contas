import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  Alarme,
  alternarAlarme,
  criarAlarme,
  formatarHora,
  listarAlarmes,
  removerAlarme,
} from "../lib/alarm";

export default function Index() {
  const [alarmes, setAlarmes] = useState<Alarme[]>([]);
  const [picker, setPicker] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setAlarmes(await listarAlarmes());
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const abrirPicker = () => {
    const agora = new Date();
    agora.setSeconds(0, 0);
    setPicker(agora);
  };

  const onTimeChange = async (_event: any, date?: Date) => {
    if (Platform.OS === "android") setPicker(null);
    if (!date) return;
    const novo = await criarAlarme(date.getHours(), date.getMinutes());
    setAlarmes((prev) => [...prev, novo]);
  };

  const onToggle = async (id: string) => {
    setAlarmes(await alternarAlarme(id));
  };

  const onRemover = (id: string) => {
    Alert.alert("Remover alarme?", "", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => setAlarmes(await removerAlarme(id)),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={alarmes}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={
          <Text style={styles.vazio}>
            Nenhum alarme. Toque em + pra criar um.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => onRemover(item.id)}
            style={styles.linha}
          >
            <Text
              style={[styles.hora, !item.ativo && styles.horaDesativada]}
            >
              {formatarHora(item.hora, item.minuto)}
            </Text>
            <Switch
              value={item.ativo}
              onValueChange={() => onToggle(item.id)}
            />
          </Pressable>
        )}
        contentContainerStyle={alarmes.length === 0 && styles.vazioContainer}
      />
      <Pressable style={styles.fab} onPress={abrirPicker}>
        <Text style={styles.fabTexto}>+</Text>
      </Pressable>
      {picker && (
        <DateTimePicker
          value={picker}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  vazioContainer: { flex: 1, justifyContent: "center" },
  vazio: { color: "#777", textAlign: "center", fontSize: 16 },
  linha: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  hora: { color: "#fff", fontSize: 48, fontWeight: "200" },
  horaDesativada: { color: "#555" },
  fab: {
    position: "absolute",
    right: 24,
    bottom: 32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#34AF23",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  fabTexto: { color: "#fff", fontSize: 36, lineHeight: 38, fontWeight: "300" },
});
