import { createRoot } from "react-dom/client";
import { createInertiaApp } from "@inertiajs/react";
import "../css/app.css";

createInertiaApp({
  title: (title) => (title ? `${title} · SQL Query` : "SQL Query"),
  resolve: (name) => {
    const pages = import.meta.glob("./Pages/**/*.tsx", { eager: true });
    return pages[`./Pages/${name}.tsx`] as { default: React.ComponentType };
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
