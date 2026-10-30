import { useTheme } from "../context/ThemeContext.jsx";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      onClick={toggleTheme}
    >
      <span className="theme-switch-track" aria-hidden="true"><span /></span>
      <span>{theme === "dark" ? "Dark" : "Light"} mode</span>
    </button>
  );
}
