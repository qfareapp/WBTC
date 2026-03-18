import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../App.css";
import "./Auth.css";

const roleOptions = ["OWNER", "ADMIN", "DEPOT_MANAGER", "SCHEDULER", "VIEWER"];

function Register({ apiBase, setApiBase, setToken, setUser }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    role: "OWNER",
    depotId: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const payload = {
        name: form.name,
        username: form.username,
        password: form.password,
        role: form.role,
        depotId: form.depotId || null,
      };

      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setToken(data.token || "");
      setUser(data.user || null);
      navigate(data.user?.role === "OWNER" ? "/owner" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-mark" />
          <div>
            <h1>Create your account</h1>
            <p className="auth-subtitle">Register to start managing depots.</p>
          </div>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            API base URL
            <input
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
              placeholder="http://localhost:5000"
            />
          </label>
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Full name"
              autoComplete="name"
            />
          </label>
          <label>
            Username
            <input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="Operator username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Password"
              autoComplete="new-password"
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label>
            Depot ID (optional)
            <input
              value={form.depotId}
              onChange={(event) => setForm({ ...form, depotId: event.target.value })}
              placeholder="Mongo object id"
            />
          </label>

          <div className="auth-actions">
            <button className="btn primary" type="submit">
              Register
            </button>
            <span className="auth-link">
              Already have an account? <Link to="/">Sign in</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Register;
