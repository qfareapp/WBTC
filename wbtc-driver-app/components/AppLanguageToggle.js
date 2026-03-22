import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAppLanguage } from "../contexts/shared-language";

export default function AppLanguageToggle() {
  const { language, toggleLanguage, t } = useAppLanguage();

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
    overflow: "hidden",
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.26)",
    minWidth: 168,
  },
  chip: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
  },
  chipActive: {
    backgroundColor: "#2563EB",
  },
  label: {
    color: "rgba(226,232,240,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
  labelActive: {
    color: "#FFFFFF",
  },
});
