import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import { lazy, Suspense } from "react";
const Admin = lazy(() => import("./admin"));

const root = createRoot(document.getElementById("root")!);
root.render(
  location.pathname === "/admin" ? (
    <Suspense
      fallback={<main className="loading">Opening the population…</main>}
    >
      <Admin />
    </Suspense>
  ) : (
    <>
      {__FIXTURE_MODE__ && (
        <div className="fixture-banner">
          SCRIPTED TEST HARNESS · No live reasoning or real learning · Use port
          5173 for the game.
        </div>
      )}
      <App />
    </>
  )
);
