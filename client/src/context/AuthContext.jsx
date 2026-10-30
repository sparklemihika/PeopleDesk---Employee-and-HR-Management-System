import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => clearSession();
    window.addEventListener("peopledesk:auth-expired", handleExpiredSession);
    if (!localStorage.getItem("peopledesk_token")) {
      setLoading(false);
      return () => window.removeEventListener("peopledesk:auth-expired", handleExpiredSession);
    }
    api("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => clearSession())
      .finally(() => setLoading(false));
    return () => window.removeEventListener("peopledesk:auth-expired", handleExpiredSession);
  }, [clearSession]);

  const login = useCallback(async (email, password, portal) => {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, portal }),
    });
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem("peopledesk_token")) {
        await api("/auth/logout", { method: "POST" });
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
