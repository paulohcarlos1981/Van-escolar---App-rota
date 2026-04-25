import { useState, useEffect } from "react";
import { ref, onValue, off, get } from "firebase/database";
import { db } from "../lib/firebase";
import { cn } from "../lib/utils";
import { Bus, MapPin, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Map Helpers
const createBusIcon = () => L.divIcon({
  html: `<div style="width:36px;height:36px;background:#f59e0b;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:#92400e"><path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C7.77 16.42 9.5 12 21 10L17 8ZM21 6L15 4C10 4 5 9 3 14H5C7 10.58 11 7 15 7L18.5 8.5L21 6ZM3 19.5C3 20.88 4.12 22 5.5 22S8 20.88 8 19.5 6.88 17 5.5 17 3 18.12 3 19.5ZM17 22C18.66 22 20 20.66 20 19H14C14 20.66 15.34 22 17 22ZM3 17H21V19H3V17Z"/></svg>
  </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const createStopIcon = (bg: string, txt: string, size: number = 22) => L.divIcon({
  html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:${size > 24 ? 10 : 9}px;font-weight:700;color:#fff">${txt}</div>`,
  className: '',
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2]
});

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [50, 50] });
    }
  }, [positions, map]);
  return null;
}

export default function ParentApp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    driver: any;
    route: any;
    student: any;
    stopIdx: number;
  } | null>(null);
  
  const [nextStopIdx, setNextStopIdx] = useState<number>(0);
  const [gps, setGps] = useState<any>(null);
  const [eta, setEta] = useState<{ mins: number, dist: number } | null>(null);
  const [absent, setAbsent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const driverId = params.get("d");
    const routeId = params.get("r");
    const stopIdx = parseInt(params.get("s") || "-1");

    if (!driverId || !routeId || stopIdx < 0) {
      setError("Link inválido. Verifique o endereço recebido.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const driverSnap = await get(ref(db, `drivers/${driverId}`));
        if (!driverSnap.exists()) throw new Error("Motorista não encontrado.");
        
        const driver = driverSnap.val();
        const route = driver.routes?.[routeId];
        if (!route) throw new Error("Rota não encontrada.");
        
        const stops = Object.values(route.stops || {}).sort((a: any, b: any) => a.idx - b.idx);
        const student = stops[stopIdx];
        if (!student) throw new Error("Dados do aluno não encontrados.");

        setData({ driver, route, student, stopIdx });
        
        // Listen for live data
        const baseKey = `${driverId}_${routeId}`;
        
        // Next stop tracker
        onValue(ref(db, `active_routes/${baseKey}/nextStopIdx`), (snap) => {
          setNextStopIdx(snap.val() || 0);
        });

        // GPS listener
        onValue(ref(db, `gps/${baseKey}`), (snap) => {
          const val = snap.val();
          setGps(val);
          if (val && val.on && student) {
            calculateETA(student, val);
          }
        });

        // Absent listener
        onValue(ref(db, `absent/${baseKey}/stop${stopIdx}`), (snap) => {
          setAbsent(!!snap.val());
        });

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const calculateETA = (student: any, gpsData: any) => {
    // Simple Haversine
    const R = 6371; // km
    const dLat = (student.lat - gpsData.lat) * Math.PI / 180;
    const dLng = (student.lng - gpsData.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(gpsData.lat * Math.PI / 180) * Math.cos(student.lat * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    const speed = gpsData.spd > 10 ? gpsData.spd : 30; // default 30km/h if slow
    const mins = Math.max(1, Math.round((dist / speed) * 60));
    
    setEta({ mins, dist });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-500 font-medium">Localizando sua van...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen p-6 text-center space-y-4">
        <div className="bg-red-100 p-4 rounded-full text-red-600">
            <AlertTriangle size={48} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{error}</h1>
        <p className="text-gray-500 max-w-xs">Entre em contato com o motorista para receber um novo link de acesso.</p>
    </div>
  );

  if (absent) return (
    <div className="flex flex-col items-center justify-center h-screen p-6 text-center space-y-4 bg-gray-50">
        <div className="bg-amber-100 p-6 rounded-full text-amber-600">
            <Clock size={64} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Ausente na Viagem</h1>
        <p className="text-gray-500 max-w-xs">Este aluno foi marcado como ausente pelo motorista para a viagem atual.</p>
        <div className="pt-8 text-xs text-gray-400">
             VanEscolar • Segurança e Transparência
        </div>
    </div>
  );

  const isLive = gps && gps.on;
  const isFinished = gps && gps.finished;
  const studentIsNextTarget = nextStopIdx === data?.stopIdx;
  const vanAlreadyPassed = nextStopIdx > data!.stopIdx;
  const vanInPreviousStops = nextStopIdx < data!.stopIdx;

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white shadow-xl border-x overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b px-6 h-14 flex items-center justify-between shrink-0 sticky top-0 z-50">
            <div className="flex items-center gap-2 font-bold">
                 <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white">
                    <Bus size={18} />
                 </div>
                 Van<span>Escolar</span>
            </div>
            <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                isLive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"
            )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", isLive ? "bg-green-500 animate-pulse" : "bg-gray-400")} />
                {isLive ? "Ao Vivo" : isFinished ? "Encerrada" : "Aguardando"}
            </div>
        </header>

        {/* Status Card */}
        <div className="p-4 bg-gray-50">
            <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-gray-950">{data?.student.child}</h2>
                        <p className="text-sm text-gray-500">{data?.route.name} • {data?.driver.name}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-gray-50 p-4 rounded-xl text-center space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Distância</p>
                        <p className="text-lg font-mono font-bold text-gray-900 leading-none pt-1">
                            {isLive && studentIsNextTarget && eta ? `${eta.dist.toFixed(1)} km` : "---"}
                        </p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-xl text-center space-y-1">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest leading-none">Chegada</p>
                        <p className="text-xl font-mono font-bold text-amber-700 leading-none pt-1">
                            {isLive && studentIsNextTarget && eta ? `${eta.mins} min` : "---"}
                        </p>
                    </div>
                </div>

                {/* Important Alert about ETA Logic */}
                <div className="flex gap-3 items-start p-3 bg-blue-50 border border-blue-100 rounded-xl">
                     <Clock className="text-blue-500 shrink-0 mt-0.5" size={18} />
                     <div className="text-xs leading-relaxed text-blue-800">
                        {isLive ? (
                            studentIsNextTarget ? (
                                <span>A van está vindo diretamente para você! <b>Prepare-se.</b></span>
                            ) : vanAlreadyPassed ? (
                                <span>A van já passou pela sua parada e segue para o próximo destino.</span>
                            ) : (
                                <span>A van está atendendo paradas anteriores. O tempo de chegada aparecerá quando você for o próximo.</span>
                            )
                        ) : isFinished ? (
                            <span>A viagem foi concluída. Bom descanso!</span>
                        ) : (
                            <span>Aguardando o motorista iniciar o percurso.</span>
                        )}
                     </div>
                </div>
            </div>
        </div>

        {/* Map View */}
        <div className="flex-1 relative bg-gray-200">
            <MapContainer center={[data!.student.lat, data!.student.lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                
                {/* My Stop */}
                <Marker position={[data!.student.lat, data!.student.lng]} icon={createStopIcon('#2563eb', '📍', 26)}>
                    <Popup><b>Sua parada</b></Popup>
                </Marker>

                {/* School */}
                <Marker position={[data!.route.schoolLat, data!.route.schoolLng]} icon={createStopIcon('#ef4444', '🏫', 24)}>
                    <Popup><b>Destino: {data!.route.schoolName}</b></Popup>
                </Marker>

                {/* Bus Pos */}
                {isLive && gps && (
                    <Marker position={[gps.lat, gps.lng]} icon={createBusIcon()} zIndexOffset={1000} />
                )}

                {/* Route Line if we want simple visual, or fit bounds */}
                <FitBounds positions={[
                    [data!.student.lat, data!.student.lng],
                    [data!.route.schoolLat, data!.route.schoolLng],
                    ...(isLive ? [[gps.lat, gps.lng] as [number, number]] : [])
                ]} />
            </MapContainer>

            {!isLive && !isFinished && (
                <div className="absolute inset-0 bg-black/5 z-[1000] backdrop-blur-[2px] flex items-center justify-center p-8">
                     <div className="bg-white p-6 rounded-2xl shadow-xl text-center space-y-2 max-w-[240px]">
                         <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
                            <Clock size={24} />
                         </div>
                         <h4 className="font-bold">Rota não iniciada</h4>
                         <p className="text-gray-500 text-[10px]">O mapa ficará disponível assim que o motorista der partida.</p>
                     </div>
                </div>
            )}
        </div>

        {/* Footer Navigation info */}
        <div className="p-4 bg-white border-t shrink-0">
             <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                 <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-600" /> Sua Parada
                 </div>
                 <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" /> Escola
                 </div>
                 <div className="flex items-center gap-1 ml-auto">
                    <ShieldCheck className="text-amber-500" size={14} /> Monitorado
                 </div>
             </div>
        </div>
    </div>
  );
}
