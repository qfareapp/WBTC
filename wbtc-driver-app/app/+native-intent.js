export function redirectSystemPath({ path }) {
  const raw = String(path ?? "").trim();

  if (!raw || raw === "/" || raw === "///") {
    return "/login";
  }

  // Dev client can send this helper path on app launch.
  if (raw.startsWith("expo-development-client")) {
    return "/login";
  }

  // Normalize full URLs like: wbtcdriver:/// or wbtcdriver://trip?x=1
  // to an in-app path that Expo Router can match.
  try {
    const maybeUrl = new URL(raw);
    const protocol = String(maybeUrl.protocol || "").toLowerCase();
    if (protocol === "wbtcdriver:" || protocol === "exp:" || protocol === "exps:") {
      const pathname = maybeUrl.pathname || "/";
      if (pathname === "/" || pathname === "///") return "/login";
      return pathname.startsWith("/") ? pathname : `/${pathname}`;
    }
  } catch {
    // Not a valid absolute URL; continue with string-based normalization.
  }

  if (raw.startsWith("wbtcdriver://")) {
    const stripped = raw.replace(/^wbtcdriver:\/\//, "");
    if (!stripped || stripped === "/" || stripped === "///") return "/login";
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }

  if (raw.startsWith("/")) {
    return raw === "/" ? "/login" : raw;
  }

  return `/${raw}`;
}
