import MapView, { Marker, UrlTile } from "react-native-maps";
import { Text, View } from "react-native";

export function AppMap({ children, ...props }) {
  return (
    <MapView provider={undefined} {...props}>
      <UrlTile
        urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        maximumZ={19}
        flipY={false}
        tileSize={256}
      />
      {children}
    </MapView>
  );
}

export function AppMapMarker(props) {
  return (
    <Marker {...props} anchor={{ x: 0.5, y: 0.5 }}>
      <View style={{
        backgroundColor: "#1B9AAA",
        borderRadius: 22,
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: "#ffffff",
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      }}>
        <Text style={{ fontSize: 20, lineHeight: 24 }}>🚌</Text>
      </View>
    </Marker>
  );
}
