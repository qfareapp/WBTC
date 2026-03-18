import MapView, { Marker } from "react-native-maps";

export function AppMap(props) {
  return <MapView {...props} />;
}

export function AppMapMarker(props) {
  return <Marker {...props} />;
}
