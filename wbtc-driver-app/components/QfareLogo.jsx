import { Image, View, StyleSheet } from "react-native";

const logoSource = require("../assets/images/qfare-logo.png");

export default function QfareLogo({ size = "large", align = "center" }) {
  const width = size === "small" ? 180 : 250;
  const height = size === "small" ? 72 : 100;

  return (
    <View style={[styles.wrap, align === "left" ? styles.left : styles.center]}>
      <Image
        source={logoSource}
        style={{ width, height }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  center: {
    alignItems: "center",
  },
  left: {
    alignItems: "flex-start",
  },
});
