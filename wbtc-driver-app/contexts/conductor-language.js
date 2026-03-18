import { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LANGUAGE_KEY = "wbtc_conductor_language";

const translations = {
  en: {
    common: {
      english: "EN",
      bengali: "বাং",
      close: "Close",
      print: "Print",
      printing: "Printing...",
      logout: "Logout",
      connected: "Connected",
      disconnected: "Disconnected",
      scanning: "Scanning...",
      scanPrinters: "Scan Printers",
      disconnect: "Disconnect",
    },
    active: {
      console: "Conductor console",
      onDutyEnabled: "On duty: offers and ticketing enabled.",
      offDutyDisabled: "Off duty: no new trip offers.",
      onDuty: "On duty",
      offDuty: "Off duty",
      tickets: "TICKETS",
      collected: "COLLECTED",
      avgPrice: "AVG PRICE",
      loadingOffers: "Loading offers...",
      offer: "OFFER",
      bus: "Bus",
      time: "Time",
      pickup: "Pickup",
      drop: "Drop",
      accept: "Accept",
      reject: "Reject",
      ticketBooking: "Ticket booking",
      issueSynced: "Issue synced tickets for cash passengers",
      acceptTripStart: "Accept a trip offer to start ticketing.",
      stops: "Stops",
      source: "Source",
      destination: "Destination",
      passengersMax: "Passengers (max 5)",
      autoFare: "Auto fare",
      total: "Total ({count})",
      waitingDriver: "Waiting for driver to start this trip.",
      driverEndedTitle: "Driver has ended this trip",
      driverEndedText: "Collect any pending tickets, then end conductor trip.",
      endConductorTrip: "End conductor trip",
      generating: "Generating...",
      generateTicket: "Generate ticket",
      ticketGenerated: "Ticket generated",
      routeNo: "Route No",
      ticketId: "Ticket ID",
      bookingTime: "Booking Time",
      passengers: "Passengers",
      fare: "FARE",
      terms: "TERMS & CONDITIONS",
      term1: "1. Valid only for this journey.",
      term2: "2. Keep till end of trip.",
      term3: "3. Subject to transport rules.",
      thanks: "Thank you for traveling with WBTC",
      endTripPrompt: "End conductor trip?",
      endTripSubtitle: "Driver completed this trip. You can snooze if you still need to issue pending tickets.",
      snooze: "Snooze",
      ending: "Ending...",
      endTrip: "End trip",
      passengerCopy: "Passenger Copy",
      live: "LIVE",
    },
    tickets: {
      console: "Conductor console",
      title: "Ticket history",
      subtitle: "Trip-wise fare and booking details for today",
      trips: "Trips",
      tickets: "Tickets",
      fare: "Fare",
      collectedFare: "Collected Fare",
      loading: "Loading ticket history...",
      bus: "Bus",
      time: "Time",
      fareCollected: "Fare collected",
      hideDetails: "Hide Details",
      showDetails: "View Details",
      ticketBreakdown: "Ticket Breakdown",
      from: "From",
      to: "To",
      passengers: "Passengers",
      pax: "Pax",
      amount: "Amount",
      mode: "Mode",
      at: "At",
      noTrips: "No trips yet today",
      noTripsDesc: "Ticket history will appear here once trips begin.",
      completed: "COMPLETED",
      total: "Total",
    },
    profile: {
      conductor: "Conductor",
      profileDetails: "Profile Details",
      name: "Name",
      employeeId: "Employee ID",
      depot: "Depot",
      status: "Status",
      startLocation: "Start Location",
      printerTitle: "Bluetooth Printer",
      printerSubtitle: "Thermal ticket printer",
      nearbyPrinters: "Nearby Printers ({count})",
      printerHint: "Scan nearby Bluetooth printers and connect directly from this app.",
    },
  },
  bn: {
    common: {
      english: "EN",
      bengali: "বাং",
      close: "বন্ধ",
      print: "প্রিন্ট",
      printing: "প্রিন্ট হচ্ছে...",
      logout: "লগআউট",
      connected: "সংযুক্ত",
      disconnected: "বিচ্ছিন্ন",
      scanning: "স্ক্যান হচ্ছে...",
      scanPrinters: "প্রিন্টার খুঁজুন",
      disconnect: "বিচ্ছিন্ন করুন",
    },
    active: {
      console: "কন্ডাক্টর কনসোল",
      onDutyEnabled: "ডিউটিতে আছেন: অফার ও টিকিটিং চালু আছে।",
      offDutyDisabled: "ডিউটির বাইরে: নতুন ট্রিপ অফার নেই।",
      onDuty: "ডিউটিতে",
      offDuty: "ডিউটির বাইরে",
      tickets: "টিকিট",
      collected: "সংগ্রহ",
      avgPrice: "গড় মূল্য",
      loadingOffers: "অফার লোড হচ্ছে...",
      offer: "অফার",
      bus: "বাস",
      time: "সময়",
      pickup: "শুরুর স্থান",
      drop: "শেষের স্থান",
      accept: "গ্রহণ",
      reject: "প্রত্যাখ্যান",
      ticketBooking: "টিকিট বুকিং",
      issueSynced: "ক্যাশ যাত্রীদের জন্য সিঙ্কড টিকিট ইস্যু করুন",
      acceptTripStart: "টিকিটিং শুরু করতে একটি ট্রিপ অফার গ্রহণ করুন।",
      stops: "স্টপেজ",
      source: "উৎস",
      destination: "গন্তব্য",
      passengersMax: "যাত্রী (সর্বোচ্চ ৫)",
      autoFare: "স্বয়ংক্রিয় ভাড়া",
      total: "মোট ({count})",
      waitingDriver: "ড্রাইভার ট্রিপ শুরু করার অপেক্ষায়।",
      driverEndedTitle: "ড্রাইভার এই ট্রিপ শেষ করেছেন",
      driverEndedText: "বাকি টিকিট সংগ্রহ করুন, তারপর কন্ডাক্টর ট্রিপ শেষ করুন।",
      endConductorTrip: "কন্ডাক্টর ট্রিপ শেষ করুন",
      generating: "তৈরি হচ্ছে...",
      generateTicket: "টিকিট তৈরি করুন",
      ticketGenerated: "টিকিট তৈরি হয়েছে",
      routeNo: "রুট নম্বর",
      ticketId: "টিকিট আইডি",
      bookingTime: "বুকিং সময়",
      passengers: "যাত্রী",
      fare: "ভাড়া",
      terms: "শর্তাবলী",
      term1: "১. শুধুমাত্র এই যাত্রার জন্য বৈধ।",
      term2: "২. ট্রিপ শেষ না হওয়া পর্যন্ত রাখুন।",
      term3: "৩. পরিবহন নিয়ম প্রযোজ্য।",
      thanks: "WBTC-র সঙ্গে ভ্রমণের জন্য ধন্যবাদ",
      endTripPrompt: "কন্ডাক্টর ট্রিপ শেষ করবেন?",
      endTripSubtitle: "ড্রাইভার ট্রিপ সম্পূর্ণ করেছেন। প্রয়োজন হলে পরে টিকিট ইস্যু করতে আপাতত স্থগিত রাখতে পারেন।",
      snooze: "পরে",
      ending: "শেষ হচ্ছে...",
      endTrip: "ট্রিপ শেষ করুন",
      passengerCopy: "যাত্রীর কপি",
      live: "সক্রিয়",
    },
    tickets: {
      console: "কন্ডাক্টর কনসোল",
      title: "টিকিট হিস্ট্রি",
      subtitle: "আজকের ট্রিপভিত্তিক ভাড়া ও বুকিং বিবরণ",
      trips: "ট্রিপ",
      tickets: "টিকিট",
      fare: "ভাড়া",
      loading: "টিকিট হিস্ট্রি লোড হচ্ছে...",
      bus: "বাস",
      time: "সময়",
      fareCollected: "সংগৃহীত ভাড়া",
      hideDetails: "বিবরণ লুকান ^",
      showDetails: "বিবরণ দেখুন v",
      from: "থেকে",
      to: "পর্যন্ত",
      passengers: "যাত্রী",
      mode: "পেমেন্ট",
      at: "সময়",
    },
    profile: {
      conductor: "কন্ডাক্টর",
      profileDetails: "প্রোফাইল বিবরণ",
      name: "নাম",
      employeeId: "কর্মী আইডি",
      depot: "ডিপো",
      status: "স্থিতি",
      startLocation: "শুরুর স্থান",
      printerTitle: "ব্লুটুথ প্রিন্টার",
      printerSubtitle: "থার্মাল টিকিট প্রিন্টার",
      nearbyPrinters: "কাছাকাছি প্রিন্টার ({count})",
      printerHint: "কাছাকাছি ব্লুটুথ প্রিন্টার খুঁজে এই অ্যাপ থেকেই সংযোগ করুন।",
    },
  },
};

const LanguageContext = createContext(null);

const applyVars = (text, vars = {}) =>
  Object.entries(vars).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), text);

export function ConductorLanguageProvider({ children }) {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const loadLanguage = async () => {
      const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (stored === "bn" || stored === "en") setLanguage(stored);
    };
    loadLanguage();
  }, []);

  const updateLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage);
    await AsyncStorage.setItem(LANGUAGE_KEY, nextLanguage);
  };

  const toggleLanguage = async () => {
    await updateLanguage(language === "en" ? "bn" : "en");
  };

  const t = (section, key, vars) => {
    const pack = translations[language]?.[section] || {};
    const fallback = translations.en?.[section] || {};
    return applyVars(pack[key] || fallback[key] || key, vars);
  };

  const value = useMemo(
    () => ({ language, setLanguage: updateLanguage, toggleLanguage, t }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useConductorLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useConductorLanguage must be used within ConductorLanguageProvider");
  return context;
};
