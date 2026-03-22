import { useEffect, useRef } from "react";
import { Platform, Vibration } from "react-native";

const OFFER_ALERT_SOUND = require("../assets/sounds/qfare-bus-jingle.wav");

let audioConfigured = false;
let audioModule = undefined;

const getAudioModule = () => {
  if (audioModule !== undefined) return audioModule;
  try {
    const expoAv = require("expo-av");
    audioModule = expoAv?.Audio || null;
  } catch {
    audioModule = null;
  }
  return audioModule;
};

const configureAudio = async () => {
  const Audio = getAudioModule();
  if (!Audio) return false;
  if (audioConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    audioConfigured = true;
  } catch {
    audioConfigured = false;
  }
  return audioConfigured;
};

const getOfferId = (offer, index) =>
  String(offer?.tripInstanceId || offer?._id || offer?.id || offer?.route?.routeCode || `offer-${index}`);

export default function useOfferAlert(offers, enabled = true) {
  const previousIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const playingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const currentIds = new Set((offers || []).map((offer, index) => getOfferId(offer, index)));

    if (!initializedRef.current) {
      previousIdsRef.current = currentIds;
      initializedRef.current = true;
      return undefined;
    }

    const hasNewOffer = [...currentIds].some((id) => !previousIdsRef.current.has(id));
    previousIdsRef.current = currentIds;

    if (!enabled || !hasNewOffer || playingRef.current) return undefined;

    const playAlert = async () => {
      playingRef.current = true;
      let sound = null;
      try {
        const Audio = getAudioModule();
        const canPlayAudio = Audio && (await configureAudio());

        if (canPlayAudio) {
          const created = await Audio.Sound.createAsync(OFFER_ALERT_SOUND, {
            shouldPlay: true,
            volume: 1,
            isLooping: false,
          });
          sound = created.sound;
          await sound.playAsync();
        } else if (Platform.OS === "android") {
          Vibration.vibrate([0, 250, 120, 250]);
        } else {
          Vibration.vibrate();
        }
      } catch {
        if (Platform.OS === "android") {
          Vibration.vibrate([0, 250, 120, 250]);
        } else {
          Vibration.vibrate();
        }
      } finally {
        try {
          if (sound) {
            setTimeout(() => {
              sound.unloadAsync().catch(() => {});
            }, 1000);
          }
        } finally {
          if (!cancelled) playingRef.current = false;
        }
      }
    };

    playAlert();

    return () => {
      cancelled = true;
      playingRef.current = false;
    };
  }, [enabled, offers]);
}
