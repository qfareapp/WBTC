import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import OperatorToggle from "../components/OperatorToggle.jsx";
import "../App.css";

const initialRoute = {
  routeNo: "",
  routeName: "",
  depotId: "",
  estimatedTripDurationMin: "",
  frequencyMin: "",
  firstTripTimeUp: "",
  firstTripTimeDown: "",
  lastTripTime: "",
  assignmentMode: "MANUAL",
};

const initialStop = { name: "", latitude: "", longitude: "", matchedStopName: "", landmarkImageUrl: "" };
const initialSlab = { fromKm: "", toKm: "", fare: "" };

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not load selected image"));
    reader.readAsDataURL(file);
  });

const canvasToBlob = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress selected image"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });

const compressImageFile = async (file, maxWidth = 480, maxHeight = 320, maxBytes = 80 * 1024) => {
  const src = await fileToDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error("Could not read selected image"));
    nextImage.src = src;
  });

  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare image canvas");
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxBytes && quality > 0.34) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > maxBytes) {
    throw new Error("Image could not be compressed below 80 KB");
  }

  return blob;
};

function RouteEntry({ apiBase, token, operatorScope, setOperatorScope }) {
  const [route, setRoute] = useState(initialRoute);
  const [stops, setStops] = useState([{ ...initialStop }, { ...initialStop }]);
  const [fareSlabs, setFareSlabs] = useState([{ ...initialSlab }]);
  const [routes, setRoutes] = useState([]);
  const [depots, setDepots] = useState([]);
  const [notice, setNotice] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);
  const [activeFareTable, setActiveFareTable] = useState(null);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [stopSuggestions, setStopSuggestions] = useState({});
  const [stopFocused, setStopFocused] = useState({});
  const stopTimers = useRef({});
  const stopRequestSeq = useRef({});

  const updateStop = (idx, updater) => {
    setStops((prev) => {
      const next = [...prev];
      const current = next[idx] || { ...initialStop };
      next[idx] = typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return next;
    });
  };

  const searchStops = (idx, query) => {
    clearTimeout(stopTimers.current[idx]);
    if (!query.trim()) {
      setStopSuggestions((p) => ({ ...p, [idx]: [] }));
      return;
    }
    stopTimers.current[idx] = setTimeout(async () => {
      const requestSeq = (stopRequestSeq.current[idx] || 0) + 1;
      stopRequestSeq.current[idx] = requestSeq;
      try {
        const params = new URLSearchParams({
          q: query,
          operatorType: operatorScope,
        });
        if (editingRouteId) params.set("excludeRouteId", editingRouteId);
        const res = await fetch(
          `${apiBase}/api/routes/stops/search?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (stopRequestSeq.current[idx] !== requestSeq) return;
        setStopSuggestions((p) => ({ ...p, [idx]: data.stops || [] }));
      } catch {
        setStopSuggestions((p) => ({ ...p, [idx]: [] }));
      }
    }, 250);
  };

  const selectStopSuggestion = (idx, suggestion) => {
    updateStop(idx, (current) => ({
      ...current,
      name: suggestion.name,
      latitude: suggestion.latitude != null ? String(suggestion.latitude) : "",
      longitude: suggestion.longitude != null ? String(suggestion.longitude) : "",
      matchedStopName: suggestion.name,
      landmarkImageUrl: current.landmarkImageUrl || "",
    }));
    setStopSuggestions((p) => ({ ...p, [idx]: [] }));
    setStopFocused((p) => ({ ...p, [idx]: false }));
  };

  const keepTypedStop = (idx) => {
    updateStop(idx, { matchedStopName: "" });
    setStopSuggestions((p) => ({ ...p, [idx]: [] }));
    setStopFocused((p) => ({ ...p, [idx]: false }));
  };

  const handleStopImageSelected = async (idx, file) => {
    if (!file) return;
    try {
      setNotice({ type: "info", message: "Uploading bus stop image..." });
      const imageUrl = await uploadStopImageToCloudinary(file);
      updateStop(idx, { landmarkImageUrl: imageUrl });
      showNotice("success", "Bus stop image uploaded.");
    } catch (error) {
      showNotice("error", error.message || "Could not process the selected image.");
    }
  };

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const uploadStopImageToCloudinary = async (file) => {
    const compressedBlob = await compressImageFile(file);

    const signResponse = await fetch(`${apiBase}/api/routes/uploads/stop-image-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const signText = await signResponse.text();
    const signData = signText ? JSON.parse(signText) : {};
    if (!signResponse.ok) {
      throw new Error(signData.message || "Failed to prepare Cloudinary upload");
    }

    const formData = new FormData();
    formData.append(
      "file",
      compressedBlob,
      `${file.name.replace(/\.[^.]+$/, "") || "stop-image"}.jpg`
    );
    formData.append("api_key", signData.apiKey);
    formData.append("timestamp", String(signData.timestamp));
    formData.append("signature", signData.signature);
    formData.append("folder", signData.folder);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signData.cloudName)}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    const uploadText = await uploadResponse.text();
    const uploadData = uploadText ? JSON.parse(uploadText) : {};
    if (!uploadResponse.ok) {
      throw new Error(uploadData.error?.message || "Cloudinary upload failed");
    }

    if (!uploadData.secure_url) {
      throw new Error("Cloudinary upload did not return an image URL");
    }

    return uploadData.secure_url;
  };

  const addStop = () => setStops((prev) => [...prev, { ...initialStop }]);
  const removeStop = (index) => setStops((prev) => prev.filter((_, idx) => idx !== index));
  const moveStop = (index, direction) => {
    setStops((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addSlab = () => setFareSlabs((prev) => [...prev, { ...initialSlab }]);
  const removeSlab = (index) => setFareSlabs((prev) => prev.filter((_, idx) => idx !== index));

  const slabIssues = useMemo(() => {
    const slabs = fareSlabs
      .map((slab, idx) => ({
        idx,
        fromKm: Number(slab.fromKm),
        toKm: Number(slab.toKm),
        fare: Number(slab.fare),
      }))
      .sort((a, b) => a.fromKm - b.fromKm);

    const issues = [];
    for (const slab of slabs) {
      if (Number.isNaN(slab.fromKm) || Number.isNaN(slab.toKm) || Number.isNaN(slab.fare)) {
        issues.push("Fare slabs must be numeric.");
        break;
      }
      if (slab.fromKm > slab.toKm) {
        issues.push("Fare slab fromKm must be <= toKm.");
        break;
      }
    }
    for (let i = 1; i < slabs.length; i += 1) {
      if (slabs[i].fromKm <= slabs[i - 1].toKm) {
        issues.push("Fare slabs cannot overlap.");
        break;
      }
    }
    return issues;
  }, [fareSlabs]);

  const stopNames = stops.map((stop) => stop.name.trim()).filter(Boolean);

  const hasExactSuggestion = (idx) => {
    const typed = String(stops[idx]?.name || "").trim().toLowerCase();
    if (!typed) return false;
    return (stopSuggestions[idx] || []).some((item) => String(item.name || "").trim().toLowerCase() === typed);
  };

  const visibleRoutes = useMemo(() => {
    return routes.filter((item) => {
      const routeOperatorType = item.operatorType || "WBTC";
      if (operatorScope === "WBTC") return routeOperatorType === "WBTC";
      return routeOperatorType === operatorScope;
    });
  }, [routes, operatorScope]);

  const getFareForDistance = (distance) => {
    const slab = fareSlabs.find((item) => {
      const fromKm = Number(item.fromKm);
      const toKm = Number(item.toKm);
      if (Number.isNaN(fromKm) || Number.isNaN(toKm)) return false;
      return distance >= fromKm && distance <= toKm;
    });
    return slab ? Number(slab.fare).toFixed(2) : "--";
  };

  const fareTable = useMemo(() => {
    return stops.map((stop, rowIdx) => {
      return stops.map((colStop, colIdx) => {
        if (colIdx > rowIdx) return "";
        if (colIdx === rowIdx) return stop.name || "--";
        const distance = rowIdx - colIdx;
        return getFareForDistance(distance);
      });
    });
  }, [stops, fareSlabs]);

  const buildFareTable = (routeStops, slabs) => {
    const getFare = (distance) => {
      const slab = slabs.find((item) => distance >= item.fromKm && distance <= item.toKm);
      return slab ? Number(slab.fare).toFixed(2) : "--";
    };
    return routeStops.map((stop, rowIdx) => {
      return routeStops.map((colStop, colIdx) => {
        if (colIdx > rowIdx) return "";
        if (colIdx === rowIdx) return stop.name || "--";
        return getFare(rowIdx - colIdx);
      });
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!route.routeNo || !route.routeName) {
      showNotice("error", "Route number and name are required.");
      return;
    }
    if (!route.depotId) {
      showNotice("error", "Associated depot is required.");
      return;
    }
    if (stopNames.length < 2) {
      showNotice("error", "At least two stops are required.");
      return;
    }
    if (slabIssues.length) {
      showNotice("error", slabIssues[0]);
      return;
    }

    try {
      const payload = {
        routeNo: route.routeNo.trim(),
        routeName: route.routeName.trim(),
        depotId: route.depotId,
        estimatedTripDurationMin: route.estimatedTripDurationMin ? Number(route.estimatedTripDurationMin) : 0,
        frequencyMin: route.frequencyMin ? Number(route.frequencyMin) : 0,
        firstTripTimeUp: route.firstTripTimeUp || null,
        firstTripTimeDown: route.firstTripTimeDown || null,
        lastTripTime: route.lastTripTime || null,
        assignmentMode: route.assignmentMode || "MANUAL",
        operatorType: operatorScope,
        stops: stops.map((stop, idx) => ({
          index: idx,
          name: stop.name.trim(),
          latitude: stop.latitude !== "" && stop.latitude != null ? Number(stop.latitude) : null,
          longitude: stop.longitude !== "" && stop.longitude != null ? Number(stop.longitude) : null,
          landmarkImageUrl: stop.landmarkImageUrl || null,
        })),
        fareSlabs: fareSlabs.map((slab) => ({
          fromKm: Number(slab.fromKm),
        toKm: Number(slab.toKm),
        fare: Number(slab.fare),
      })),
      };

      const url = editingRouteId ? `${apiBase}/api/routes/${editingRouteId}` : `${apiBase}/api/routes`;
      const response = await fetch(url, {
        method: editingRouteId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to save route");

      if (editingRouteId) {
        setRoutes((prev) =>
          prev.map((item) => (item._id === data.route._id ? data.route : item))
        );
        showNotice("success", "Route updated.");
      } else {
        setRoutes((prev) => [data.route, ...prev]);
        showNotice("success", "Route saved.");
      }
      setEditingRouteId(null);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadRouteDetails = async (routeId) => {
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load route");

      setEditingRouteId(routeId);
      setRoute({
        routeNo: data.route.routeCode || "",
        routeName: data.route.routeName || "",
        depotId: data.route.depotId?._id || data.route.depotId || "",
        estimatedTripDurationMin: data.route.standardTripTimeMin || "",
        frequencyMin: data.route.frequencyMin || "",
        firstTripTimeUp: data.route.firstTripTimeUp || "",
        firstTripTimeDown: data.route.firstTripTimeDown || "",
        lastTripTime: data.route.lastTripTime || "",
        assignmentMode: data.route.assignmentMode || "MANUAL",
      });
      setStops(
        (data.stops || [])
          .sort((a, b) => a.index - b.index)
          .map((stop) => ({
            name: stop.name,
            latitude: stop.latitude != null ? String(stop.latitude) : "",
            longitude: stop.longitude != null ? String(stop.longitude) : "",
            matchedStopName: "",
            landmarkImageUrl: stop.landmarkImageUrl || "",
          }))
      );
      setFareSlabs(
        (data.fareSlabs || [])
          .sort((a, b) => a.fromKm - b.fromKm)
          .map((slab) => ({ fromKm: slab.fromKm, toKm: slab.toKm, fare: slab.fare }))
      );
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingRouteId(null);
    setRoute(initialRoute);
    setStops([{ ...initialStop }, { ...initialStop }]);
    setFareSlabs([{ ...initialSlab }]);
    setStopSuggestions({});
    setStopFocused({});
  };

  const loadRoutes = async () => {
    try {
      const response = await fetch(`${apiBase}/api/routes?operatorType=${encodeURIComponent(operatorScope)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load routes");
      setRoutes(data.routes || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const loadDepots = async () => {
    try {
      const response = await fetch(`${apiBase}/api/depots?operatorType=${encodeURIComponent(operatorScope)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load depots");
      setDepots(data.depots || []);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const openRouteMatrix = async (routeItem) => {
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeItem._id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to load route details");

      const routeStops = (data.stops || []).sort((a, b) => a.index - b.index);
      const slabs = (data.fareSlabs || []).sort((a, b) => a.fromKm - b.fromKm);
      setActiveRoute({ ...data.route, stops: routeStops });
      setActiveFareTable(buildFareTable(routeStops, slabs));
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  const toggleAssignmentMode = async (routeItem) => {
    const nextMode = routeItem.assignmentMode === "AUTO" ? "MANUAL" : "AUTO";
    try {
      const response = await fetch(`${apiBase}/api/routes/${routeItem._id}/assignment-mode`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assignmentMode: nextMode }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to update assignment mode");

      setRoutes((prev) =>
        prev.map((item) => (item._id === routeItem._id ? data.route : item))
      );
      showNotice("success", `Route mode set to ${nextMode}.`);
    } catch (error) {
      showNotice("error", error.message);
    }
  };

  useEffect(() => {
    loadRoutes();
    loadDepots();
    setRoute((prev) => ({ ...prev, depotId: "" }));
    setEditingRouteId(null);
    setStopSuggestions({});
    setStopFocused({});
  }, [apiBase, token, operatorScope]);

  useEffect(() => {
    return () => {
      Object.values(stopTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

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
              <span className="pill">Route entry</span>
            </div>
          </div>
          <nav className="nav">
            <Link className="nav-item" to="/dashboard">Dashboard</Link>
            <Link className="nav-item" to="/owners">Owners</Link>
            <Link className="nav-item" to="/buses">Bus entry</Link>
            <Link className="nav-item" to="/depots">Depot entry</Link>
            <Link className="nav-item" to="/drivers">Driver entry</Link>
            <Link className="nav-item" to="/conductors">Conductor entry</Link>
            <Link className="nav-item" to="/bus-crew">Bus crew mapping</Link>
            <Link className="nav-item" to="/routes">Route entry</Link>
            <Link className="nav-item" to="/scheduling">Trip scheduling</Link>
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
                <h1>Route fare setup</h1>
                <span className="pill">Stops + slabs</span>
              </div>
            </div>
            <div className="topbar-actions">
              <OperatorToggle value={operatorScope} onChange={setOperatorScope} />
              <Link className="btn ghost" to="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <main className="main">
            {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

            <section className="grid two">
              <div className="panel" style={{ overflow: "visible" }}>
                <div className="panel-header">
                  <h3>Route basic details</h3>
                  <span className="pill">Route</span>
                </div>
                <form className="form" onSubmit={handleSave}>
                  <label className="field">
                    Operator scope
                    <input value={operatorScope} readOnly />
                  </label>
                  <label className="field">
                    Route number
                    <input
                      value={route.routeNo}
                      onChange={(event) => setRoute({ ...route, routeNo: event.target.value })}
                      placeholder="212"
                    />
                  </label>
                  <label className="field">
                    Route name
                    <input
                      value={route.routeName}
                      onChange={(event) => setRoute({ ...route, routeName: event.target.value })}
                      placeholder="Palbazar - Howrah"
                    />
                  </label>
                  <label className="field">
                    Associated depot
                    <select
                      value={route.depotId}
                      onChange={(event) => setRoute({ ...route, depotId: event.target.value })}
                    >
                      <option value="">Select depot</option>
                      {depots.map((depot) => (
                        <option key={depot._id} value={depot._id}>
                          {depot.depotName} ({depot.depotCode})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inline">
                    <label className="field">
                      Estimated trip duration (min)
                      <input
                        type="number"
                        value={route.estimatedTripDurationMin}
                        onChange={(event) =>
                          setRoute({ ...route, estimatedTripDurationMin: event.target.value })
                        }
                        placeholder="60"
                      />
                    </label>
                    <label className="field">
                      Bus frequency (min)
                      <input
                        type="number"
                        value={route.frequencyMin}
                        onChange={(event) => setRoute({ ...route, frequencyMin: event.target.value })}
                        placeholder="30"
                      />
                    </label>
                  </div>
                  <div className="inline">
                    <label className="field">
                      First trip from A (Up)
                      <input
                        type="time"
                        value={route.firstTripTimeUp}
                        onChange={(event) => setRoute({ ...route, firstTripTimeUp: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      First trip from B (Down)
                      <input
                        type="time"
                        value={route.firstTripTimeDown}
                        onChange={(event) => setRoute({ ...route, firstTripTimeDown: event.target.value })}
                      />
                    </label>
                  <label className="field">
                    Last trip departure
                    <input
                      type="time"
                      value={route.lastTripTime}
                      onChange={(event) => setRoute({ ...route, lastTripTime: event.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  Assignment mode
                  <select
                    value={route.assignmentMode || "MANUAL"}
                    onChange={(event) => setRoute({ ...route, assignmentMode: event.target.value })}
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="AUTO">Automatic</option>
                  </select>
                </label>
              </form>

                <div className="panel" style={{ background: "var(--panel-strong)", overflow: "visible" }}>
                  <div className="panel-header">
                    <h3>Stops entry</h3>
                    <span className="pill">Ordered list</span>
                  </div>
                  <div className="list">
                    {stops.map((stop, idx) => (
                      <div className="list-item stop-editor" key={`stop-${idx}`}>
                        <div className="stop-editor-main">
                          <strong>Stop {idx}</strong>
                          <div className="stop-editor-search">
                            <input
                              value={stop.name}
                              onChange={(event) => {
                                const nextName = event.target.value;
                                updateStop(idx, (current) => {
                                  const next = { ...current, name: nextName };
                                  const selectedName = String(current.matchedStopName || "").trim().toLowerCase();
                                  const typedName = nextName.trim().toLowerCase();
                                  if (
                                    typedName &&
                                    selectedName &&
                                    typedName !== selectedName &&
                                    (current.latitude !== "" || current.longitude !== "")
                                  ) {
                                    next.latitude = "";
                                    next.longitude = "";
                                  }
                                  next.matchedStopName = typedName === selectedName ? current.matchedStopName : "";
                                  return next;
                                });
                                searchStops(idx, nextName);
                              }}
                              onFocus={() => setStopFocused((p) => ({ ...p, [idx]: true }))}
                              onBlur={() => setTimeout(() => setStopFocused((p) => ({ ...p, [idx]: false })), 150)}
                              placeholder="Stop name"
                              style={{ width: "100%" }}
                              autoComplete="off"
                            />
                            {stopFocused[idx] && stop.name.trim() && (
                              <div className="stop-editor-suggestions">
                                {(stopSuggestions[idx] || []).map((s, si) => (
                                  <div
                                    key={`${s.name}-${si}`}
                                    onMouseDown={() => selectStopSuggestion(idx, s)}
                                    style={{
                                      padding: "8px 12px", cursor: "pointer",
                                      borderBottom: "1px solid var(--line)",
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--panel-strong)"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = ""}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: "13px" }}>{s.name}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                      {s.latitude != null && s.longitude != null
                                        ? `${Number(s.latitude).toFixed(5)}, ${Number(s.longitude).toFixed(5)}`
                                        : "No coordinates saved"}
                                      {s.routeCode ? ` | ${s.routeCode}` : ""}
                                      {s.routeName ? ` | ${s.routeName}` : ""}
                                    </div>
                                  </div>
                                ))}
                                {!hasExactSuggestion(idx) && (
                                  <div
                                    onMouseDown={() => keepTypedStop(idx)}
                                    style={{
                                      padding: "8px 12px",
                                      cursor: "pointer",
                                      background: "var(--panel-strong)",
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: "13px" }}>
                                      Use "{stop.name.trim()}" as a new stop
                                    </div>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                      No backend match selected. Manual coordinates are still allowed.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="stop-editor-paste">
                            <input
                              placeholder="Paste coordinates  e.g. 22.6547, 88.4467"
                              className="stop-editor-paste-input"
                              onPaste={(event) => {
                                const text = event.clipboardData.getData("text");
                                const parts = text.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
                                if (parts.length >= 2) {
                                  event.preventDefault();
                                  updateStop(idx, { latitude: parts[0], longitude: parts[1] });
                                }
                              }}
                              value=""
                              onChange={() => {}}
                            />
                          </div>
                          <div className="stop-editor-coords">
                            <input
                              type="number"
                              value={stop.latitude}
                              onChange={(event) => {
                                updateStop(idx, { latitude: event.target.value });
                              }}
                              placeholder="Latitude"
                              step="any"
                              className="stop-editor-coord-input"
                            />
                            <input
                              type="number"
                              value={stop.longitude}
                              onChange={(event) => {
                                updateStop(idx, { longitude: event.target.value });
                              }}
                              placeholder="Longitude"
                              step="any"
                              className="stop-editor-coord-input"
                            />
                          </div>
                          <div className="stop-editor-upload">
                            <label className="field stop-editor-upload-field">
                              Bus stop image / landmark thumbnail
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  void handleStopImageSelected(idx, file);
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            {stop.landmarkImageUrl ? (
                              <div className="stop-editor-upload-preview">
                                <img
                                  src={stop.landmarkImageUrl}
                                  alt={`${stop.name || "Stop"} landmark`}
                                  className="stop-editor-upload-image"
                                />
                                <button
                                  className="btn ghost"
                                  type="button"
                                  onClick={() => updateStop(idx, { landmarkImageUrl: "" })}
                                >
                                  Remove image
                                </button>
                              </div>
                            ) : (
                              <span className="stop-editor-upload-hint">
                                Upload a small landmark image that passengers can tap to confirm the exact bus stop.
                              </span>
                            )}
                          </div>
                          {stop.latitude && stop.longitude && (
                            <a
                              href={`https://www.google.com/maps?q=${stop.latitude},${stop.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: "11px", color: "var(--accent)", marginTop: "4px", display: "inline-block" }}
                            >
                              ↗ Verify on map
                            </a>
                          )}
                        </div>
                        <div className="stop-editor-actions">
                          <button className="btn ghost" type="button" onClick={() => moveStop(idx, -1)}>
                            Up
                          </button>
                          <button className="btn ghost" type="button" onClick={() => moveStop(idx, 1)}>
                            Down
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => removeStop(idx)}
                            disabled={stops.length <= 2}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="btn outline" type="button" onClick={addStop}>
                    Add stop
                  </button>
                </div>

                <div className="panel" style={{ background: "var(--panel-strong)" }}>
                  <div className="panel-header">
                    <h3>Fare slabs</h3>
                    <span className="pill">Auto fare</span>
                  </div>
                  {slabIssues.length > 0 && (
                    <div className="notice error">{slabIssues[0]}</div>
                  )}
                  <div className="list">
                    {fareSlabs.map((slab, idx) => (
                      <div className="list-item" key={`slab-${idx}`}>
                        <div style={{ display: "grid", gap: "6px" }}>
                          <div className="inline">
                            <label className="field">
                              From KM
                              <input
                                type="number"
                                value={slab.fromKm}
                                onChange={(event) => {
                                  const next = [...fareSlabs];
                                  next[idx] = { ...next[idx], fromKm: event.target.value };
                                  setFareSlabs(next);
                                }}
                              />
                            </label>
                            <label className="field">
                              To KM
                              <input
                                type="number"
                                value={slab.toKm}
                                onChange={(event) => {
                                  const next = [...fareSlabs];
                                  next[idx] = { ...next[idx], toKm: event.target.value };
                                  setFareSlabs(next);
                                }}
                              />
                            </label>
                            <label className="field">
                              Fare
                              <input
                                type="number"
                                value={slab.fare}
                                onChange={(event) => {
                                  const next = [...fareSlabs];
                                  next[idx] = { ...next[idx], fare: event.target.value };
                                  setFareSlabs(next);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                        <button className="btn ghost" type="button" onClick={() => removeSlab(idx)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="btn outline" type="button" onClick={addSlab}>
                    Add fare slab
                  </button>
                </div>

                <div className="inline">
                  <button className="btn primary" type="button" onClick={handleSave}>
                    {editingRouteId ? "Update route" : "Save route"}
                  </button>
                  {editingRouteId && (
                    <button className="btn ghost" type="button" onClick={handleCancelEdit}>
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>Generated fare table</h3>
                  <span className="pill">Read only</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>KM</th>
                        {stops.map((stop, idx) => (
                          <th key={`head-${idx}`}>{stop.name || `Stop ${idx}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fareTable.map((row, rowIdx) => (
                        <tr key={`row-${rowIdx}`}>
                          <td>{rowIdx}</td>
                          {row.map((cell, colIdx) => (
                            <td key={`cell-${rowIdx}-${colIdx}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <h3>Entered routes</h3>
                <span className="pill">{visibleRoutes.length} total</span>
              </div>
              {visibleRoutes.length === 0 ? (
                <div className="list-item">
                  <div>
                    <strong>No routes yet</strong>
                    <span>Save a route to see it listed here.</span>
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route No</th>
                      <th>Route Name</th>
                      <th>Depot</th>
                      <th>Source</th>
                      <th>Destination</th>
                      <th>Mode</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRoutes.map((item) => (
                      <tr key={item._id || item.routeCode}>
                        <td>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => openRouteMatrix(item)}
                          >
                            {item.routeCode}
                          </button>
                        </td>
                        <td>{item.routeName}</td>
                        <td>{item.depotId?.depotName || item.depotId}</td>
                        <td>{item.source}</td>
                        <td>{item.destination}</td>
                        <td>
                          <button
                            className={`btn ${item.assignmentMode === "AUTO" ? "outline" : "ghost"}`}
                            type="button"
                            onClick={() => toggleAssignmentMode(item)}
                          >
                            {item.assignmentMode || "MANUAL"}
                          </button>
                        </td>
                        <td>
                          <button className="btn ghost" type="button" onClick={() => loadRouteDetails(item._id)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </main>
        </div>
      </div>
      {activeRoute && activeFareTable && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: "min(900px, 95vw)" }}>
            <div className="panel-header">
              <h3>Fare Table of Route No {activeRoute.routeCode}</h3>
              <button className="btn ghost" type="button" onClick={() => setActiveRoute(null)}>
                Close
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>KM</th>
                    {activeRoute.stops.map((stop, idx) => (
                      <th key={`modal-head-${idx}`}>{stop.name || `Stop ${idx}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeFareTable.map((row, rowIdx) => (
                    <tr key={`modal-row-${rowIdx}`}>
                      <td>{rowIdx}</td>
                      {row.map((cell, colIdx) => (
                        <td key={`modal-cell-${rowIdx}-${colIdx}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteEntry;

