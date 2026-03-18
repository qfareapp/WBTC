import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../App.css";

const localIsoDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = localIsoDate();

const toMinutes = (time) => {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

const fromMinutes = (mins) => {
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const formatActualTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const buildMapUrl = (latitude, longitude) => {
  const delta = 0.01;
  const left = longitude - delta;
  const right = longitude + delta;
  const top = latitude + delta;
  const bottom = latitude - delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`;
};

const getStartLocation = (route, direction) => {
  if (!route || !route.source || !route.destination) return null;
  return direction === "UP" ? route.source : route.destination;
};

const getEndLocation = (route, direction) => {
  if (!route || !route.source || !route.destination) return null;
  return direction === "UP" ? route.destination : route.source;
};

const isAtLocation = (resource, location) => {
  if (!location) return true;
  if (!resource?.currentLocation) return true;
  return resource.currentLocation === location;
};

const normalizeLocation = (value) => String(value || "").trim().toLowerCase();

const parseApiText = (text) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.startsWith("<!DOCTYPE") ? "Server returned HTML error response." : text };
  }
};

const getBusLabel = (busId, buses) => {
  if (!busId) return "Pending";
  const bus = buses.find((item) => item._id === busId);
  if (!bus) return "Assigned";
  return bus.busType ? `${bus.busNumber} (${bus.busType})` : bus.busNumber;
};

function RouteTimeline({ apiBase, token }) {
  const { routeId } = useParams();
  const [route, setRoute] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [tripInstances, setTripInstances] = useState({});
  const [routeActive, setRouteActive] = useState(false);
  const [mapView, setMapView] = useState(null);
  const [availableBusModal, setAvailableBusModal] = useState(null);
  const [autoBusUpIds, setAutoBusUpIds] = useState([]);
  const [autoBusDownIds, setAutoBusDownIds] = useState([]);
  const [autoBusy, setAutoBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseBusId, setReleaseBusId] = useState("");
  const [modeSaving, setModeSaving] = useState(false);
  const [dayStatus, setDayStatus] = useState({
    activated: false,
    autoOffersEnabled: false,
    busIdsUp: [],
    busIdsDown: [],
  });

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    const loadRoute = async () => {
      try {
        const response = await fetch(`${apiBase}/api/routes/${routeId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        const data = parseApiText(text);
        if (!response.ok) throw new Error(data.message || "Failed to load route");
        setRoute(data.route || null);
      } catch (error) {
        showNotice("error", error.message);
      }
    };

    if (routeId) loadRoute();
  }, [apiBase, routeId, token]);

  const loadTrips = useCallback(async () => {
    if (!routeId || !selectedDate) return;
    try {
      const response = await fetch(`${apiBase}/api/trips?routeId=${routeId}&date=${selectedDate}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to load trips");

      const assignmentMap = {};
      const instanceMap = {};
        (data.trips || []).forEach((trip) => {
          const tripKey = `${selectedDate}-${trip.direction}-${trip.startTime}`;
          instanceMap[tripKey] = trip._id;
          assignmentMap[tripKey] = {
            busId: trip.busId?._id || trip.busId || "",
            driverId: trip.assignment?.driverId?._id || trip.assignment?.driverId || "",
            active: trip.status === "Active",
            completed: trip.status === "Completed",
            cancelled: trip.status === "Cancelled",
            actualStartTime: trip.actualStartTime || null,
            actualEndTime: trip.actualEndTime || null,
            actualDurationMin: trip.actualDurationMin ?? null,
            lastLatitude: trip.lastLatitude ?? null,
            lastLongitude: trip.lastLongitude ?? null,
            lastLocationAt: trip.lastLocationAt || null,
          };
        });
      setAssignments((prev) => ({
        ...prev,
        ...assignmentMap,
      }));
      setTripInstances((prev) => ({
        ...prev,
        ...instanceMap,
      }));
    } catch (error) {
      showNotice("error", error.message);
    }
  }, [apiBase, routeId, selectedDate, token]);

  const loadDayStatus = useCallback(async () => {
    if (!routeId || !selectedDate) return;
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeId}/day-status?date=${selectedDate}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to load day status");
      setDayStatus({
        activated: Boolean(data.activated),
        autoOffersEnabled: data.autoOffersEnabled === true,
        busIdsUp: Array.isArray(data.busIdsUp) ? data.busIdsUp : [],
        busIdsDown: Array.isArray(data.busIdsDown) ? data.busIdsDown : [],
      });
    } catch {
      setDayStatus({ activated: false, autoOffersEnabled: false, busIdsUp: [], busIdsDown: [] });
    }
  }, [apiBase, routeId, selectedDate, token]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    loadDayStatus();
  }, [loadDayStatus]);

  useEffect(() => {
    if (!routeId || !selectedDate) return undefined;
    const interval = setInterval(loadTrips, 5000);
    return () => clearInterval(interval);
  }, [loadTrips, routeId, selectedDate]);

  useEffect(() => {
    if (!route?.depotId) return;

    const loadBuses = async () => {
      try {
        const response = await fetch(`${apiBase}/api/buses`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        const data = parseApiText(text);
        if (!response.ok) throw new Error(data.message || "Failed to load buses");
        const filtered = (data.buses || []).filter(
          (bus) => (bus.depotId?._id || bus.depotId) === route.depotId
        );
        setBuses(filtered);
      } catch (error) {
        showNotice("error", error.message);
      }
    };

    const loadDrivers = async () => {
      try {
        const response = await fetch(`${apiBase}/api/drivers`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        const data = parseApiText(text);
        if (!response.ok) throw new Error(data.message || "Failed to load drivers");
        const filtered = (data.drivers || []).filter(
          (driver) => (driver.depotId?._id || driver.depotId) === route.depotId
        );
        setDrivers(filtered);
      } catch (error) {
        showNotice("error", error.message);
      }
    };

    loadBuses();
    loadDrivers();
  }, [apiBase, route, token]);

  useEffect(() => {
    setAutoBusUpIds((prev) => prev.filter((busId) => buses.some((bus) => bus._id === busId)));
    setAutoBusDownIds((prev) => prev.filter((busId) => buses.some((bus) => bus._id === busId)));
  }, [buses]);

  const toggleAutoBusSelection = (direction, busId) => {
    const inUp = autoBusUpIds.includes(busId);
    const inDown = autoBusDownIds.includes(busId);
    if (direction === "UP" && inDown && !inUp) {
      showNotice("error", "One bus can be assigned only once: UP or DOWN.");
      return;
    }
    if (direction === "DOWN" && inUp && !inDown) {
      showNotice("error", "One bus can be assigned only once: UP or DOWN.");
      return;
    }
    const setter = direction === "UP" ? setAutoBusUpIds : setAutoBusDownIds;
    setter((prev) => (prev.includes(busId) ? prev.filter((id) => id !== busId) : [...prev, busId]));
  };

  const buildTimeline = (startTime) => {
    if (!route) return [];
    const start = toMinutes(startTime);
    const end = toMinutes(route.lastTripTime);
    const duration = Number(route.standardTripTimeMin || 0);
    const frequency = Number(route.frequencyMin || 0);

    if (!start || !end || !duration || !frequency) return [];

    const trips = [];
    let time = start;
    while (time + duration <= end) {
      trips.push({
        startTime: fromMinutes(time),
        endTime: fromMinutes(time + duration),
      });
      time += frequency;
    }
    return trips;
  };

  const upTimeline = useMemo(() => {
    if (!route) return [];
    return buildTimeline(route.firstTripTimeUp);
  }, [route]);

  const downTimeline = useMemo(() => {
    if (!route) return [];
    return buildTimeline(route.firstTripTimeDown);
  }, [route]);

  const handleAssign = (tripKey, field, value) => {
    setAssignments((prev) => ({
      ...prev,
      [tripKey]: {
        ...(prev[tripKey] || {}),
        [field]: value,
      },
    }));
  };

  const handleAutoActivateDay = async () => {
    if (!routeId || !selectedDate) return;
    setAutoBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeId}/activate-day`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: selectedDate }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to activate auto schedule");
      showNotice("success", "Auto schedule activated.");
      setDayStatus((prev) => ({ ...prev, activated: true, autoOffersEnabled: true }));
      await loadTrips();
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setAutoBusy(false);
    }
  };

  const handleAutoDeactivateDay = async () => {
    if (!routeId || !selectedDate) return;
    setAutoBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeId}/deactivate-day`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: selectedDate }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to deactivate route for day");
      showNotice("success", "Route deactivated. Auto offers stopped for this date.");
      setDayStatus((prev) => ({ ...prev, activated: true, autoOffersEnabled: false }));
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setAutoBusy(false);
    }
  };

  const handleReleaseBus = async () => {
    if (!routeId || !selectedDate || !releaseBusId) return;
    setReleaseBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeId}/release-bus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: selectedDate, busId: releaseBusId }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to release bus");
      showNotice("success", `${data.busNumber || "Bus"} released from route for ${selectedDate}.`);
      setReleaseBusId("");
      await Promise.all([loadTrips(), loadDayStatus()]);
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setReleaseBusy(false);
    }
  };

  const activateTrip = async (tripKey, trip) => {
    const assignment = assignments[tripKey] || {};
    if (!assignment.busId || !assignment.driverId) {
      showNotice("error", "Assign bus and driver before activating.");
      return;
    }
    try {
      const payload = {
        date: selectedDate,
        depotId: route?.depotId?._id || route?.depotId,
        routeId,
        busId: assignment.busId,
        driverId: assignment.driverId,
        direction: trip.direction,
        startTime: trip.startTime,
        endTime: trip.endTime,
      };
      const response = await fetch(`${apiBase}/api/trips/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to activate trip");

      setAssignments((prev) => ({
        ...prev,
        [tripKey]: {
          ...(prev[tripKey] || {}),
          active: true,
          completed: false,
        },
      }));
      setTripInstances((prev) => ({ ...prev, [tripKey]: data.trip?._id || prev[tripKey] }));
      showNotice("success", "Trip activated.");
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const completeTrip = async (tripKey, direction) => {
    const tripInstanceId = tripInstances[tripKey];
    if (!tripInstanceId) {
      showNotice("error", "Trip instance not found.");
      return;
    }
    try {
      const response = await fetch(`${apiBase}/api/trips/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tripInstanceId }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to complete trip");

      setAssignments((prev) => ({
        ...prev,
        [tripKey]: {
          ...(prev[tripKey] || {}),
          active: false,
          completed: true,
        },
      }));

      const endLocation = getEndLocation(route, direction);
      if (endLocation) {
        const assignment = assignments[tripKey] || {};
        if (assignment.busId) {
          setBuses((prev) =>
            prev.map((bus) =>
              bus._id === assignment.busId ? { ...bus, currentLocation: endLocation } : bus
            )
          );
        }
        if (assignment.driverId) {
          setDrivers((prev) =>
            prev.map((driver) =>
              driver._id === assignment.driverId ? { ...driver, currentLocation: endLocation } : driver
            )
          );
        }
      }

      showNotice("success", "Trip completed.");
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const activeBusIds = useMemo(() => {
    const ids = new Set();
    Object.entries(assignments).forEach(([tripKey, assignment]) => {
      if (!tripKey.startsWith(`${selectedDate}-`)) return;
      if (assignment?.active && assignment.busId) ids.add(assignment.busId);
    });
    return ids;
  }, [assignments, selectedDate]);

  const activeDriverIds = useMemo(() => {
    const ids = new Set();
    Object.entries(assignments).forEach(([tripKey, assignment]) => {
      if (!tripKey.startsWith(`${selectedDate}-`)) return;
      if (assignment?.active && assignment.driverId) ids.add(assignment.driverId);
    });
    return ids;
  }, [assignments, selectedDate]);

  const upStartLocation = useMemo(() => getStartLocation(route, "UP"), [route]);
  const downStartLocation = useMemo(() => getStartLocation(route, "DOWN"), [route]);
  const upDirectionLabel = useMemo(() => {
    if (!route?.source || !route?.destination) return "Direction unavailable";
    return `${route.source} to ${route.destination}`;
  }, [route]);
  const downDirectionLabel = useMemo(() => {
    if (!route?.source || !route?.destination) return "Direction unavailable";
    return `${route.destination} to ${route.source}`;
  }, [route]);

  const autoAttachedBuses = useMemo(
    () =>
      buses.filter((bus) => String(bus.attachedRouteId?._id || bus.attachedRouteId || "") === String(routeId || "")),
    [buses, routeId]
  );

  const autoBusesForUp = useMemo(
    () => autoAttachedBuses.filter((bus) => normalizeLocation(bus.currentLocation) === normalizeLocation(route?.source)),
    [autoAttachedBuses, route]
  );

  const autoBusesForDown = useMemo(
    () =>
      autoAttachedBuses.filter(
        (bus) => normalizeLocation(bus.currentLocation) === normalizeLocation(route?.destination)
      ),
    [autoAttachedBuses, route]
  );

  const autoBusesWithoutStartPoint = useMemo(
    () =>
      autoAttachedBuses.filter((bus) => {
        const loc = normalizeLocation(bus.currentLocation);
        return loc !== normalizeLocation(route?.source) && loc !== normalizeLocation(route?.destination);
      }),
    [autoAttachedBuses, route]
  );
  const isAuto = route?.assignmentMode === "AUTO";

  const handleModeToggle = async () => {
    if (!route?._id || modeSaving) return;
    const nextMode = isAuto ? "MANUAL" : "AUTO";
    setModeSaving(true);
    try {
      const response = await fetch(`${apiBase}/api/routes/${route._id}/assignment-mode`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignmentMode: nextMode }),
      });
      const text = await response.text();
      const data = parseApiText(text);
      if (!response.ok) throw new Error(data.message || "Failed to update assignment mode");
      setRoute((prev) => (prev ? { ...prev, assignmentMode: data.route?.assignmentMode || nextMode } : prev));
      showNotice("success", `Route set to ${nextMode} mode.`);
      await loadTrips();
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setModeSaving(false);
    }
  };

  const plannedUpBusIdsForDate = useMemo(() => {
    const ids = new Set();
    Object.entries(assignments).forEach(([tripKey, assignment]) => {
      if (!tripKey.startsWith(`${selectedDate}-UP-`)) return;
      if (assignment?.busId) ids.add(assignment.busId);
    });
    return ids;
  }, [assignments, selectedDate]);

  const plannedDownBusIdsForDate = useMemo(() => {
    const ids = new Set();
    Object.entries(assignments).forEach(([tripKey, assignment]) => {
      if (!tripKey.startsWith(`${selectedDate}-DOWN-`)) return;
      if (assignment?.busId) ids.add(assignment.busId);
    });
    return ids;
  }, [assignments, selectedDate]);

  const activationUpBusIds = useMemo(
    () => new Set((dayStatus.busIdsUp || []).map((id) => String(id))),
    [dayStatus.busIdsUp]
  );

  const activationDownBusIds = useMemo(
    () => new Set((dayStatus.busIdsDown || []).map((id) => String(id))),
    [dayStatus.busIdsDown]
  );

  const effectivePlannedUpBusIdsForDate = useMemo(() => {
    if (plannedUpBusIdsForDate.size > 0) return plannedUpBusIdsForDate;
    return activationUpBusIds;
  }, [plannedUpBusIdsForDate, activationUpBusIds]);

  const effectivePlannedDownBusIdsForDate = useMemo(() => {
    if (plannedDownBusIdsForDate.size > 0) return plannedDownBusIdsForDate;
    return activationDownBusIds;
  }, [plannedDownBusIdsForDate, activationDownBusIds]);

  const assignedRouteBusesForDate = useMemo(() => {
    const ids = new Set([...effectivePlannedUpBusIdsForDate, ...effectivePlannedDownBusIdsForDate]);
    return buses.filter((bus) => ids.has(bus._id));
  }, [buses, effectivePlannedDownBusIdsForDate, effectivePlannedUpBusIdsForDate]);

  useEffect(() => {
    if (assignedRouteBusesForDate.length === 0) {
      setReleaseBusId("");
      return;
    }
    if (!assignedRouteBusesForDate.some((bus) => bus._id === releaseBusId)) {
      setReleaseBusId(assignedRouteBusesForDate[0]._id);
    }
  }, [assignedRouteBusesForDate, releaseBusId]);

  const routeActivatedForDate = useMemo(
    () => Object.keys(tripInstances).some((tripKey) => tripKey.startsWith(`${selectedDate}-`)),
    [tripInstances, selectedDate]
  );

  const getTripUiState = useCallback(
    (trip, assignment = {}) => {
      if (assignment.completed) return "completed";
      if (assignment.active) return "live";
      if (assignment.cancelled) return "cancelled";
      const hasNoTaker = !assignment.driverId;
      if (!hasNoTaker) return "scheduled";
      const tripStartMin = toMinutes(trip?.startTime);
      if (tripStartMin === null) return "scheduled";
      const now = new Date();
      const currentDate = localIsoDate();
      const dateCmp = selectedDate.localeCompare(currentDate);
      if (dateCmp > 0) return "scheduled";
      const cutoffMin = dateCmp < 0 ? 24 * 60 : now.getHours() * 60 + now.getMinutes();
      if (tripStartMin + 30 <= cutoffMin) return "cancelled";
      return "scheduled";
    },
    [selectedDate]
  );

  const availableUpBusList = useMemo(() => {
    if (!routeActivatedForDate && !dayStatus.activated) return [];
    return buses.filter((bus) => effectivePlannedUpBusIdsForDate.has(bus._id) && !activeBusIds.has(bus._id));
  }, [routeActivatedForDate, dayStatus.activated, buses, effectivePlannedUpBusIdsForDate, activeBusIds]);

  const availableDownBusList = useMemo(() => {
    if (!routeActivatedForDate && !dayStatus.activated) return [];
    return buses.filter((bus) => effectivePlannedDownBusIdsForDate.has(bus._id) && !activeBusIds.has(bus._id));
  }, [routeActivatedForDate, dayStatus.activated, buses, effectivePlannedDownBusIdsForDate, activeBusIds]);

  const availableUpBuses = availableUpBusList.length;
  const availableDownBuses = availableDownBusList.length;

  const upCancelledTrips = useMemo(
    () =>
      upTimeline.filter((trip) => {
        const tripKey = `${selectedDate}-UP-${trip.startTime}`;
        const assignment = assignments[tripKey] || {};
        return getTripUiState(trip, assignment) === "cancelled";
      }),
    [assignments, getTripUiState, selectedDate, upTimeline]
  );

  const downCancelledTrips = useMemo(
    () =>
      downTimeline.filter((trip) => {
        const tripKey = `${selectedDate}-DOWN-${trip.startTime}`;
        const assignment = assignments[tripKey] || {};
        return getTripUiState(trip, assignment) === "cancelled";
      }),
    [assignments, downTimeline, getTripUiState, selectedDate]
  );

  const upScheduledTrips = useMemo(
    () =>
      upTimeline.filter((trip) => {
        const tripKey = `${selectedDate}-UP-${trip.startTime}`;
        const assignment = assignments[tripKey] || {};
        return getTripUiState(trip, assignment) === "scheduled";
      }),
    [assignments, getTripUiState, selectedDate, upTimeline]
  );

  const downScheduledTrips = useMemo(
    () =>
      downTimeline.filter((trip) => {
        const tripKey = `${selectedDate}-DOWN-${trip.startTime}`;
        const assignment = assignments[tripKey] || {};
        return getTripUiState(trip, assignment) === "scheduled";
      }),
    [assignments, downTimeline, getTripUiState, selectedDate]
  );

  const upVisibleScheduledSet = useMemo(
    () => new Set(upScheduledTrips.slice(0, 5).map((trip) => trip.startTime)),
    [upScheduledTrips]
  );
  const downVisibleScheduledSet = useMemo(
    () => new Set(downScheduledTrips.slice(0, 5).map((trip) => trip.startTime)),
    [downScheduledTrips]
  );
  const upCollapsedScheduledTrips = useMemo(() => upScheduledTrips.slice(5), [upScheduledTrips]);
  const downCollapsedScheduledTrips = useMemo(() => downScheduledTrips.slice(5), [downScheduledTrips]);

  const tripStats = useMemo(() => {
    const stats = {
      upCompleted: 0,
      downCompleted: 0,
      live: 0,
      scheduled: 0,
      cancelled: 0,
      running: 0,
    };
    upTimeline.forEach((trip) => {
      const tripKey = `${selectedDate}-UP-${trip.startTime}`;
      const assignment = assignments[tripKey] || {};
      const uiState = getTripUiState(trip, assignment);
      if (uiState === "completed") stats.upCompleted += 1;
      if (uiState === "live") stats.live += 1;
      if (uiState === "scheduled") stats.scheduled += 1;
      if (uiState === "cancelled") stats.cancelled += 1;
      if (assignment.active && assignment.actualStartTime && !assignment.actualEndTime) stats.running += 1;
    });
    downTimeline.forEach((trip) => {
      const tripKey = `${selectedDate}-DOWN-${trip.startTime}`;
      const assignment = assignments[tripKey] || {};
      const uiState = getTripUiState(trip, assignment);
      if (uiState === "completed") stats.downCompleted += 1;
      if (uiState === "live") stats.live += 1;
      if (uiState === "scheduled") stats.scheduled += 1;
      if (uiState === "cancelled") stats.cancelled += 1;
      if (assignment.active && assignment.actualStartTime && !assignment.actualEndTime) stats.running += 1;
    });
    return stats;
  }, [assignments, downTimeline, getTripUiState, selectedDate, upTimeline]);

  return (
    <div className="app">
      <div className="background">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-mark" />
            <div>
              <p className="sidebar-title">WBTC Fleet</p>
              <span className="pill">Trip timeline</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/scheduling">Trip scheduling</Link>
            <Link className="nav-item" to="/routes">Route entry</Link>
            <Link className="nav-item" to="/payments">Payment</Link>
            <Link className="nav-item live-nav" to="/live-trips">Live trips</Link>
          </nav>
          <div className="sidebar-footer">
            <span className="pill">API: {apiBase}</span>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <h1>Route timeline</h1>
                <span className="pill">{route?.routeCode || "Route"}</span>
              </div>
            </div>
            <div className="topbar-actions">
              <Link className="btn ghost" to="/scheduling">
                Back to scheduling
              </Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="panel">
              <div className="panel-header">
                <h3>Route schedule inputs</h3>
                <button
                  type="button"
                  className={`mode-toggle ${isAuto ? "auto" : "manual"}`}
                  onClick={handleModeToggle}
                  disabled={modeSaving}
                  aria-label="Toggle assignment mode"
                >
                  <span className={`mode-toggle-track ${isAuto ? "auto" : "manual"}`}>
                    <span className="mode-toggle-thumb" />
                  </span>
                  <span className="mode-toggle-label">{modeSaving ? "Saving..." : isAuto ? "Auto mode" : "Manual mode"}</span>
                </button>
              </div>
              <div className="stats-row" style={{ marginBottom: "16px" }}>
                <div className="stat stat-up">
                  <span>Completed (Up)</span>
                  <strong>{tripStats.upCompleted}</strong>
                </div>
                <div className="stat stat-down">
                  <span>Completed (Down)</span>
                  <strong>{tripStats.downCompleted}</strong>
                </div>
                <div className="stat stat-live">
                  <span>Live trips</span>
                  <strong>{tripStats.live}</strong>
                </div>
                <div className="stat stat-scheduled">
                  <span>Scheduled trips</span>
                  <strong>{tripStats.scheduled}</strong>
                </div>
                <div className="stat stat-cancelled">
                  <span>Cancelled trips</span>
                  <strong>{tripStats.cancelled}</strong>
                </div>
                <div className="stat stat-running">
                  <span>Running now</span>
                  <strong>{tripStats.running}</strong>
                </div>
              </div>
              <div className="inline">
                <label className="field">
                  Date
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  First trip (Up)
                  <input value={route?.firstTripTimeUp || ""} readOnly />
                </label>
                <label className="field">
                  First trip (Down)
                  <input value={route?.firstTripTimeDown || ""} readOnly />
                </label>
                <label className="field">
                  Last trip
                  <input value={route?.lastTripTime || ""} readOnly />
                </label>
                <label className="field">
                  Frequency (min)
                  <input value={route?.frequencyMin || ""} readOnly />
                </label>
                <label className="field">
                  Duration (min)
                  <input value={route?.standardTripTimeMin || ""} readOnly />
                </label>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Generated trip timeline</h3>
                <span className="pill">{upTimeline.length + downTimeline.length} trips</span>
              </div>
                {isAuto && (
                  <div className="panel" style={{ background: "var(--panel-strong)", marginBottom: "16px" }}>
                    <div className="panel-header">
                      <h3>Auto day activation</h3>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {dayStatus.autoOffersEnabled && <span className="pill pill-available">Route activated</span>}
                        {dayStatus.activated && !dayStatus.autoOffersEnabled && <span className="pill">Route deactivated</span>}
                        <span className="pill">{selectedDate}</span>
                      </div>
                    </div>
                  <div className="inline">
                    <label className="field">
                      Bus for UP (owner start point = {route?.source || "--"})
                      <div className="checkbox-list">
                        {autoBusesForUp.map((bus) => (
                          <span key={`up-${bus._id}`} className="checkbox-item">
                            {bus.busNumber} ({bus.busType})
                          </span>
                        ))}
                        {autoBusesForUp.length === 0 && <span className="checkbox-empty">No UP buses selected by owners</span>}
                      </div>
                    </label>
                    <label className="field">
                      Bus for DOWN (owner start point = {route?.destination || "--"})
                      <div className="checkbox-list">
                        {autoBusesForDown.map((bus) => (
                          <span key={`down-${bus._id}`} className="checkbox-item">
                            {bus.busNumber} ({bus.busType})
                          </span>
                        ))}
                        {autoBusesForDown.length === 0 && (
                          <span className="checkbox-empty">No DOWN buses selected by owners</span>
                        )}
                      </div>
                      </label>
                      <button className="btn primary" type="button" onClick={handleAutoActivateDay} disabled={autoBusy}>
                      {autoBusy ? "Processing..." : dayStatus.autoOffersEnabled ? "Route activated" : "Activate day schedule"}
                      </button>
                      {dayStatus.activated && (
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={handleAutoDeactivateDay}
                          disabled={autoBusy || !dayStatus.autoOffersEnabled}
                        >
                          Deactivate route
                        </button>
                      )}
                    </div>
                    {autoBusesWithoutStartPoint.length > 0 && (
                      <div className="list-item" style={{ marginTop: "8px" }}>
                        <div>
                          <strong>Owner action required</strong>
                          <span>
                            These buses need start point selection (source/destination) before activation:{" "}
                            {autoBusesWithoutStartPoint.map((bus) => bus.busNumber).join(", ")}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="inline" style={{ marginTop: "8px" }}>
                      <label className="field">
                        Release bus from this route
                        <select
                          value={releaseBusId}
                          onChange={(event) => setReleaseBusId(event.target.value)}
                          disabled={releaseBusy || assignedRouteBusesForDate.length === 0}
                        >
                          {assignedRouteBusesForDate.length === 0 ? (
                            <option value="">No assigned buses for this date</option>
                          ) : (
                            assignedRouteBusesForDate.map((bus) => (
                              <option key={`release-${bus._id}`} value={bus._id}>
                                {bus.busNumber} ({bus.busType})
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={handleReleaseBus}
                        disabled={releaseBusy || !releaseBusId}
                      >
                        {releaseBusy ? "Releasing..." : "Release bus"}
                      </button>
                    </div>
                  </div>
                )}
              {upTimeline.length === 0 && downTimeline.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>Missing schedule inputs</strong>
                    <span>Set first/last trip time, frequency, and duration on the route.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="panel" style={{ background: "var(--panel-strong)" }}>
                    <div className="panel-header">
                      <div>
                        <h3>Up trips</h3>
                        <span className="trip-direction">{upDirectionLabel}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span className="pill">{upTimeline.length}</span>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => setAvailableBusModal({ direction: "UP", buses: availableUpBusList })}
                        >
                          Available buses: {availableUpBuses}
                        </button>
                      </div>
                    </div>
                    <div className="timeline">
                      {upTimeline.map((trip, idx) => (
                    (() => {
                      const tripKey = `${selectedDate}-UP-${trip.startTime}`;
                      const assignment = assignments[tripKey] || {};
                      const tripMeta = { ...trip, direction: "UP" };
                      const uiState = getTripUiState(trip, assignment);
                      if (uiState === "cancelled") return null;
                      if (uiState === "scheduled" && !upVisibleScheduledSet.has(trip.startTime)) return null;
                      const rowClassName =
                        uiState === "live"
                          ? "timeline-row timeline-row-live"
                          : uiState === "scheduled"
                          ? "timeline-row timeline-row-scheduled"
                          : "timeline-row";
                      return (
                    <div className={rowClassName} key={`${trip.startTime}-${idx}`}>
                      <div className="timeline-time">{trip.startTime}</div>
                      <div>
                        <strong>{route?.routeCode}</strong>
                        <span>{upDirectionLabel}</span>
                        <span>{trip.startTime}-{trip.endTime}</span>
                      </div>
                      <div className="timeline-action">
                        {isAuto ? (
                          <div className="row-actions">
                            <span className="pill">
                              Bus: {assignment.driverId ? getBusLabel(assignment.busId, buses) : "--"}
                            </span>
                            <span className="pill">
                              Driver: {assignment.driverId ? drivers.find((driver) => driver._id === assignment.driverId)?.name || "Assigned" : "Awaiting"}
                            </span>
                            {assignment.completed ? (
                              <span className="chip">
                                Completed Â· {formatActualTime(assignment.actualStartTime)}-
                                {formatActualTime(assignment.actualEndTime)} Â·{" "}
                                {assignment.actualDurationMin ?? "--"} min
                              </span>
                            ) : assignment.active ? (
                              <>
                                <span className="chip chip-live">
                                  Trip started {formatActualTime(assignment.actualStartTime)}
                                </span>
                                {assignment.lastLatitude && assignment.lastLongitude && (
                                  <button
                                    className="btn outline"
                                    type="button"
                                    onClick={() =>
                                      setMapView({
                                        latitude: assignment.lastLatitude,
                                        longitude: assignment.lastLongitude,
                                      })
                                    }
                                  >
                                    Live tracking
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="chip chip-scheduled">Scheduled</span>
                            )}
                          </div>
                        ) : (
                          <div className="row-actions">
                          <select
                            value={assignment.busId || ""}
                            onChange={(event) => handleAssign(tripKey, "busId", event.target.value)}
                          >
                            <option value="">Assign bus</option>
                            {buses
                              .filter((bus) => assignment.busId === bus._id || isAtLocation(bus, upStartLocation))
                              .map((bus) => {
                                const disabled = activeBusIds.has(bus._id) && assignment.busId !== bus._id;
                                return (
                                  <option key={bus._id} value={bus._id} disabled={disabled}>
                                    {bus.busNumber}
                                  </option>
                                );
                              })}
                          </select>
                          <select
                            value={assignment.driverId || ""}
                            onChange={(event) => handleAssign(tripKey, "driverId", event.target.value)}
                          >
                            <option value="">Assign driver</option>
                            {drivers
                              .filter((driver) => assignment.driverId === driver._id || isAtLocation(driver, upStartLocation))
                              .map((driver) => {
                                const disabled = activeDriverIds.has(driver._id) && assignment.driverId !== driver._id;
                                return (
                                  <option key={driver._id} value={driver._id} disabled={disabled}>
                                    {driver.name} ({driver.empId})
                                  </option>
                                );
                              })}
                          </select>
                          {assignment.completed ? (
                            <span className="chip">
                              Completed · {formatActualTime(assignment.actualStartTime)}-
                              {formatActualTime(assignment.actualEndTime)} ·{" "}
                              {assignment.actualDurationMin ?? "--"} min
                            </span>
                          ) : assignment.active ? (
                            <>
                              <span className="chip chip-live">
                                Trip started {formatActualTime(assignment.actualStartTime)}
                              </span>
                              <button
                                className="btn success"
                                type="button"
                                disabled
                              >
                                Active
                              </button>
                              {assignment.lastLatitude && assignment.lastLongitude && (
                                <button
                                  className="btn outline"
                                  type="button"
                                  onClick={() =>
                                    setMapView({
                                      latitude: assignment.lastLatitude,
                                      longitude: assignment.lastLongitude,
                                    })
                                  }
                                >
                                  Live map
                                </button>
                              )}
                              <button
                                className="btn ghost"
                                type="button"
                                onClick={() => completeTrip(tripKey, tripMeta.direction)}
                              >
                                Complete trip
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn outline"
                              type="button"
                              disabled={!assignment.busId || !assignment.driverId}
                              onClick={() => activateTrip(tripKey, tripMeta)}
                            >
                              Activate trip
                            </button>
                          )}
                          </div>
                        )}
                      </div>
                    </div>
                      );
                    })()
                  ))}
                    </div>
                    {upCollapsedScheduledTrips.length > 0 && (
                      <details className="scheduled-group">
                        <summary>More scheduled trips ({upCollapsedScheduledTrips.length})</summary>
                        <div className="timeline cancelled-list">
                          {upCollapsedScheduledTrips.map((trip, idx) => (
                            <div className="timeline-row timeline-row-scheduled" key={`up-scheduled-${trip.startTime}-${idx}`}>
                              <div className="timeline-time">{trip.startTime}</div>
                              <div>
                                <strong>{route?.routeCode}</strong>
                                <span>{upDirectionLabel}</span>
                                <span>{trip.startTime}-{trip.endTime}</span>
                              </div>
                              <div className="timeline-action">
                                <span className="chip chip-scheduled">Scheduled</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {upCancelledTrips.length > 0 && (
                      <details className="cancelled-group">
                        <summary>Cancelled trips ({upCancelledTrips.length})</summary>
                        <div className="timeline cancelled-list">
                          {upCancelledTrips.map((trip, idx) => (
                            <div className="timeline-row timeline-row-cancelled" key={`up-cancelled-${trip.startTime}-${idx}`}>
                              <div className="timeline-time">{trip.startTime}</div>
                              <div>
                                <strong>{route?.routeCode}</strong>
                                <span>{upDirectionLabel}</span>
                                <span>{trip.startTime}-{trip.endTime}</span>
                              </div>
                              <div className="timeline-action">
                                <span className="chip chip-cancelled">Cancelled (no taker in 30 min)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="panel" style={{ background: "var(--panel-strong)" }}>
                    <div className="panel-header">
                      <div>
                        <h3>Down trips</h3>
                        <span className="trip-direction">{downDirectionLabel}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span className="pill">{downTimeline.length}</span>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => setAvailableBusModal({ direction: "DOWN", buses: availableDownBusList })}
                        >
                          Available buses: {availableDownBuses}
                        </button>
                      </div>
                    </div>
                    <div className="timeline">
                      {downTimeline.map((trip, idx) => (
                    (() => {
                      const tripKey = `${selectedDate}-DOWN-${trip.startTime}`;
                      const assignment = assignments[tripKey] || {};
                      const tripMeta = { ...trip, direction: "DOWN" };
                      const uiState = getTripUiState(trip, assignment);
                      if (uiState === "cancelled") return null;
                      if (uiState === "scheduled" && !downVisibleScheduledSet.has(trip.startTime)) return null;
                      const rowClassName =
                        uiState === "live"
                          ? "timeline-row timeline-row-live"
                          : uiState === "scheduled"
                          ? "timeline-row timeline-row-scheduled"
                          : "timeline-row";
                      return (
                    <div className={rowClassName} key={`down-${trip.startTime}-${idx}`}>
                      <div className="timeline-time">{trip.startTime}</div>
                      <div>
                        <strong>{route?.routeCode} (Down)</strong>
                        <span>{downDirectionLabel}</span>
                        <span>{trip.startTime}-{trip.endTime}</span>
                      </div>
                      <div className="timeline-action">
                        {isAuto ? (
                          <div className="row-actions">
                            <span className="pill">
                              Bus: {assignment.driverId ? getBusLabel(assignment.busId, buses) : "--"}
                            </span>
                            <span className="pill">
                              Driver: {assignment.driverId ? drivers.find((driver) => driver._id === assignment.driverId)?.name || "Assigned" : "Awaiting"}
                            </span>
                            {assignment.completed ? (
                              <span className="chip">
                                Completed Â· {formatActualTime(assignment.actualStartTime)}-
                                {formatActualTime(assignment.actualEndTime)} Â·{" "}
                                {assignment.actualDurationMin ?? "--"} min
                              </span>
                            ) : assignment.active ? (
                              <>
                                <span className="chip chip-live">
                                  Trip started {formatActualTime(assignment.actualStartTime)}
                                </span>
                                {assignment.lastLatitude && assignment.lastLongitude && (
                                  <button
                                    className="btn outline"
                                    type="button"
                                    onClick={() =>
                                      setMapView({
                                        latitude: assignment.lastLatitude,
                                        longitude: assignment.lastLongitude,
                                      })
                                    }
                                  >
                                    Live tracking
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="chip chip-scheduled">Scheduled</span>
                            )}
                          </div>
                        ) : (
                          <div className="row-actions">
                          <select
                            value={assignment.busId || ""}
                            onChange={(event) => handleAssign(tripKey, "busId", event.target.value)}
                          >
                            <option value="">Assign bus</option>
                            {buses
                              .filter((bus) => assignment.busId === bus._id || isAtLocation(bus, downStartLocation))
                              .map((bus) => {
                                const disabled = activeBusIds.has(bus._id) && assignment.busId !== bus._id;
                                return (
                                  <option key={bus._id} value={bus._id} disabled={disabled}>
                                    {bus.busNumber}
                                  </option>
                                );
                              })}
                          </select>
                          <select
                            value={assignment.driverId || ""}
                            onChange={(event) => handleAssign(tripKey, "driverId", event.target.value)}
                          >
                            <option value="">Assign driver</option>
                            {drivers
                              .filter((driver) => assignment.driverId === driver._id || isAtLocation(driver, downStartLocation))
                              .map((driver) => {
                                const disabled = activeDriverIds.has(driver._id) && assignment.driverId !== driver._id;
                                return (
                                  <option key={driver._id} value={driver._id} disabled={disabled}>
                                    {driver.name} ({driver.empId})
                                  </option>
                                );
                              })}
                          </select>
                          {assignment.completed ? (
                            <span className="chip">
                              Completed · {formatActualTime(assignment.actualStartTime)}-
                              {formatActualTime(assignment.actualEndTime)} ·{" "}
                              {assignment.actualDurationMin ?? "--"} min
                            </span>
                          ) : assignment.active ? (
                            <>
                              <span className="chip chip-live">
                                Trip started {formatActualTime(assignment.actualStartTime)}
                              </span>
                              <button
                                className="btn success"
                                type="button"
                                disabled
                              >
                                Active
                              </button>
                              {assignment.lastLatitude && assignment.lastLongitude && (
                                <button
                                  className="btn outline"
                                  type="button"
                                  onClick={() =>
                                    setMapView({
                                      latitude: assignment.lastLatitude,
                                      longitude: assignment.lastLongitude,
                                    })
                                  }
                                >
                                  Live map
                                </button>
                              )}
                              <button
                                className="btn ghost"
                                type="button"
                                onClick={() => completeTrip(tripKey, tripMeta.direction)}
                              >
                                Complete trip
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn outline"
                              type="button"
                              disabled={!assignment.busId || !assignment.driverId}
                              onClick={() => activateTrip(tripKey, tripMeta)}
                            >
                              Activate trip
                            </button>
                          )}
                          </div>
                        )}
                      </div>
                    </div>
                      );
                    })()
                  ))}
                    </div>
                    {downCollapsedScheduledTrips.length > 0 && (
                      <details className="scheduled-group">
                        <summary>More scheduled trips ({downCollapsedScheduledTrips.length})</summary>
                        <div className="timeline cancelled-list">
                          {downCollapsedScheduledTrips.map((trip, idx) => (
                            <div className="timeline-row timeline-row-scheduled" key={`down-scheduled-${trip.startTime}-${idx}`}>
                              <div className="timeline-time">{trip.startTime}</div>
                              <div>
                                <strong>{route?.routeCode} (Down)</strong>
                                <span>{downDirectionLabel}</span>
                                <span>{trip.startTime}-{trip.endTime}</span>
                              </div>
                              <div className="timeline-action">
                                <span className="chip chip-scheduled">Scheduled</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {downCancelledTrips.length > 0 && (
                      <details className="cancelled-group">
                        <summary>Cancelled trips ({downCancelledTrips.length})</summary>
                        <div className="timeline cancelled-list">
                          {downCancelledTrips.map((trip, idx) => (
                            <div className="timeline-row timeline-row-cancelled" key={`down-cancelled-${trip.startTime}-${idx}`}>
                              <div className="timeline-time">{trip.startTime}</div>
                              <div>
                                <strong>{route?.routeCode} (Down)</strong>
                                <span>{downDirectionLabel}</span>
                                <span>{trip.startTime}-{trip.endTime}</span>
                              </div>
                              <div className="timeline-action">
                                <span className="chip chip-cancelled">Cancelled (no taker in 30 min)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </>
              )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h3>Route activation</h3>
                <span className="pill">{routeActive ? "Active" : "Inactive"}</span>
              </div>
              <div className="inline">
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => setRouteActive(true)}
                >
                  Activate route
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setRouteActive(false)}
                >
                  Deactivate
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
      {mapView && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: "min(720px, 95vw)" }}>
            <div className="panel-header">
              <h3>Live location</h3>
              <button className="btn ghost" type="button" onClick={() => setMapView(null)}>
                Close
              </button>
            </div>
            <div style={{ width: "100%", height: "360px", borderRadius: "14px", overflow: "hidden" }}>
              <iframe
                title="Trip live location"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                src={buildMapUrl(mapView.latitude, mapView.longitude)}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}
      {availableBusModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-header">
              <h3>{availableBusModal.direction} available buses</h3>
              <button className="btn ghost" type="button" onClick={() => setAvailableBusModal(null)}>
                Close
              </button>
            </div>
            <div className="list">
              {availableBusModal.buses.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No buses currently available</strong>
                    <span>Availability updates when trips start/complete.</span>
                  </div>
                </div>
              ) : (
                availableBusModal.buses.map((bus) => (
                  <div className="list-item" key={`available-${availableBusModal.direction}-${bus._id}`}>
                    <div>
                      <strong>{bus.busNumber}</strong>
                      <span>{bus.busType || "Bus"}</span>
                    </div>
                    <span>{bus.currentLocation || "Location unknown"}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteTimeline;
