import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useConductorLanguage } from "../contexts/conductor-language";

export default function ConductorLanguageToggle() {
  const { language, toggleLanguage, t } = useConductorLanguage();

  return (
    <TouchableOpacity style={styles.toggle} onPress={toggleLanguage} activeOpacity={0.85}>
      <View style={[styles.chip, language === "en" ? styles.chipActive : null]}>
        <Text style={[styles.label, language === "en" ? styles.labelActive : null]}>{t("common", "english")}</Text>
      </View>
      <View style={[styles.chip, language === "bn" ? styles.chipActive : null]}>
        <Text style={[styles.label, language === "bn" ? styles.labelActive : null]}>{t("common", "bengali")}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.26)",
  },
  chip: {
    minWidth: 42,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#2563EB",
  },
  label: {
    color: "rgba(226,232,240,0.72)",
    fontSize: 11,
    fontWeight: "800",
  },
  labelActive: {
    color: "#FFFFFF",
  },
});
