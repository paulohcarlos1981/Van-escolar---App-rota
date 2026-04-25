import { useEffect, useState } from "react";
import DriverApp from "./components/DriverApp";
import ParentApp from "./components/ParentApp";

export default function App() {
  const [view, setView] = useState<"driver" | "parent">("driver");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v");
    console.log("App view v:", v);
    if (v === "parent") setView("parent");
    else setView("driver");
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 font-sans text-gray-900 overflow-x-hidden">
      {view === "parent" ? <ParentApp /> : <DriverApp />}
    </main>
  );
}
