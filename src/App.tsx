import { useEffect, useState } from "react";
import DriverApp from "./components/DriverApp";
import ParentApp from "./components/ParentApp";

export default function App() {
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v");
    setView(v === "parent" ? "parent" : "driver");
  }, []);

  if (!view) return null;

  return (
    <main className="min-h-screen bg-gray-100 font-sans text-gray-900 overflow-x-hidden">
      {view === "parent" ? <ParentApp /> : <DriverApp />}
    </main>
  );
}
