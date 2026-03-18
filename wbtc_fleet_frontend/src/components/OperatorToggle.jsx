function OperatorToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <button
        className={`btn ${value === "WBTC" ? "primary" : "ghost"}`}
        type="button"
        onClick={() => onChange("WBTC")}
      >
        WBTC
      </button>
      <button
        className={`btn ${value === "PRIVATE" ? "primary" : "ghost"}`}
        type="button"
        onClick={() => onChange("PRIVATE")}
      >
        PRIVATE
      </button>
    </div>
  );
}

export default OperatorToggle;

