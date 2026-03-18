import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../App.css";
import "./Auth.css";

function Login({ apiBase, setApiBase, setToken, setUser }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
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
            <h1>WBTC Fleet Ops</h1>
            <p className="auth-subtitle">Sign in to access the dashboard.</p>
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
              autoComplete="current-password"
            />
          </label>

          <div className="auth-actions">
            <button className="btn primary" type="submit">
              Sign in
            </button>
            <span className="auth-link">
              Need an account? <Link to="/register">Register</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
