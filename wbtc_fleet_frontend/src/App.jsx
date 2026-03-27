import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import BusEntry from "./pages/BusEntry.jsx";
import DepotEntry from "./pages/DepotEntry.jsx";
import DriverEntry from "./pages/DriverEntry.jsx";
import ConductorEntry from "./pages/ConductorEntry.jsx";
import BusCrewEntry from "./pages/BusCrewEntry.jsx";
import RouteEntry from "./pages/RouteEntry.jsx";
import TripScheduling from "./pages/TripScheduling.jsx";
import RouteTimeline from "./pages/RouteTimeline.jsx";
import LiveTrips from "./pages/LiveTrips.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import OwnerAssignCrew from "./pages/OwnerAssignCrew.jsx";
import OwnersOverview from "./pages/OwnersOverview.jsx";
import PaymentsOverview from "./pages/PaymentsOverview.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";

const storedApiBase = localStorage.getItem("wbtc_api_base");
const defaultApiBase = import.meta.env.DEV ? "http://localhost:5000" : "https://wbtc-aduk.onrender.com";

function App() {
  const [apiBase, setApiBase] = useState(() => storedApiBase || defaultApiBase);
  const [token, setToken] = useState(() => localStorage.getItem("wbtc_token") || "");
  const [operatorScope, setOperatorScope] = useState(() => localStorage.getItem("wbtc_operator_scope") || "WBTC");
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("wbtc_user");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("wbtc_token", token);
    } else {
      localStorage.removeItem("wbtc_token");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("wbtc_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("wbtc_user");
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem("wbtc_operator_scope", operatorScope);
  }, [operatorScope]);

  useEffect(() => {
    if (apiBase) {
      localStorage.setItem("wbtc_api_base", apiBase);
    } else {
      localStorage.removeItem("wbtc_api_base");
    }
  }, [apiBase]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            token ? (
              <Navigate to={user?.role === "OWNER" ? "/owner" : "/dashboard"} replace />
            ) : (
              <Login apiBase={apiBase} setApiBase={setApiBase} setToken={setToken} setUser={setUser} />
            )
          }
        />
        <Route
          path="/register"
          element={
            token ? (
              <Navigate to={user?.role === "OWNER" ? "/owner" : "/dashboard"} replace />
            ) : (
              <Register apiBase={apiBase} setApiBase={setApiBase} setToken={setToken} setUser={setUser} />
            )
          }
        />
        <Route
          path="/owner"
          element={
            token ? (
              user?.role === "OWNER" ? (
                <OwnerDashboard apiBase={apiBase} token={token} user={user} setToken={setToken} setUser={setUser} />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/owner/assign-crew"
          element={
            token ? (
              user?.role === "OWNER" ? (
                <OwnerAssignCrew apiBase={apiBase} token={token} user={user} setToken={setToken} setUser={setUser} />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            token ? (
              user?.role === "OWNER" ? (
                <Navigate to="/owner" replace />
              ) : (
                <Dashboard
                  apiBase={apiBase}
                  setApiBase={setApiBase}
                  token={token}
                  setToken={setToken}
                  user={user}
                  setUser={setUser}
                  operatorScope={operatorScope}
                  setOperatorScope={setOperatorScope}
                />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/buses"
          element={
            token ? (
              <BusEntry apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/owners"
          element={
            token ? (
              user?.role === "OWNER" ? (
                <Navigate to="/owner" replace />
              ) : (
                <OwnersOverview apiBase={apiBase} token={token} />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/payments"
          element={
            token ? (
              user?.role === "OWNER" ? (
                <Navigate to="/owner" replace />
              ) : (
                <PaymentsOverview apiBase={apiBase} token={token} />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/depots"
          element={
            token ? (
              <DepotEntry apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/drivers"
          element={
            token ? (
              <DriverEntry apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/conductors"
          element={
            token ? (
              <ConductorEntry apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/bus-crew"
          element={
            token ? (
              <BusCrewEntry apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/routes"
          element={
            token ? (
              <RouteEntry apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/scheduling"
          element={
            token ? (
              <TripScheduling apiBase={apiBase} token={token} operatorScope={operatorScope} setOperatorScope={setOperatorScope} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/live-trips"
          element={
            token ? (
              <LiveTrips apiBase={apiBase} token={token} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/scheduling/:routeId"
          element={
            token ? (
              <RouteTimeline apiBase={apiBase} token={token} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
