import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { WaffleMark } from "./brand";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(
  null,
);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#23150f" : "#fff9ef");
    try {
      localStorage.setItem("waffles-theme", theme);
    } catch {
      /* Theme still works when storage is unavailable. */
    }
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        event.key === "waffles-theme" &&
        (event.newValue === "light" || event.newValue === "dark")
      )
        setTheme(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggle: () =>
          setTheme((value) => (value === "light" ? "dark" : "light")),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme provider missing");
  return context;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-label="Dark theme"
      aria-checked={theme === "dark"}
      data-theme={theme}
      title={`Flip to ${theme === "light" ? "midnight" : "daylight"} Waffles`}
      onClick={toggle}
    >
      <span className="theme-day" aria-hidden="true">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
        </svg>
      </span>
      <span className="theme-night" aria-hidden="true">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M20.6 14A9 9 0 0 1 10 3.4 9 9 0 1 0 20.6 14Z" />
        </svg>
      </span>
      <span className="theme-waffle">
        <WaffleMark />
      </span>
    </button>
  );
}

export function chartPalette() {
  const style = getComputedStyle(document.documentElement);
  return {
    surface: style.getPropertyValue("--palette-surface").trim(),
    text: style.getPropertyValue("--palette-secondary").trim(),
    line: style.getPropertyValue("--palette-line").trim(),
    up: style.getPropertyValue("--palette-positive").trim(),
    down: style.getPropertyValue("--palette-negative").trim(),
  };
}
