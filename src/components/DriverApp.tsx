import React, { useState, useEffect, useRef } from "react";
import { ref, onValue, set, remove, push, get, off } from "firebase/database";
import { db } from "../lib/firebase";
import { cn } from "../lib/utils";
import { 
  Bus, Lock, User, Plus, MapPin, School, FileText, 
  Settings, LogOut, Trash2, Edit2, Play, Square, Check, X,
  Copy, Phone, Map as MapIcon
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix generic markers in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Types
interface Stop {
  idx: number;
  child: string;
  rua: string;
  num: string;
  bairro: string;
  cidade: string;
  addr: string;
  lat: number;
  lng: number;
  isSchool?: boolean;
}

interface SchoolData {
  id: string;
  name: string;
  rua: string;
  num: string;
  bairro: string;
  cidade: string;
  lat: number;
  lng: number;
}

interface Route {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
  schoolLat: number;
  schoolLng: number;
  stops: Record<string, Stop>;
}

interface Driver {
  id: string;
  name: string;
  pin: string;
  routes?: Record<string, Route>;
  schools?: Record<string, SchoolData>;
  sessionMins?: number;
}

// Utility Components
const Badge = ({ children, active }: { children: React.ReactNode, active?: boolean }) => (
  <div className={cn(
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
    active ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-500 border-gray-200"
  )}>
    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", active ? "bg-amber-500 animate-pulse" : "bg-gray-400")} />
    {children}
  </div>
);

const Button = ({ className, variant = "primary", size = "md", fullWidth, ...props }: any) => {
  const variants: any = {
    primary: "bg-amber-500 text-amber-950 hover:bg-amber-400",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    outline: "bg-transparent text-gray-600 border border-gray-200 hover:bg-gray-50",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100"
  };
  const sizes: any = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    />
  );
};

const Card = ({ children, className, live }: { children: React.ReactNode, className?: string, live?: boolean }) => (
  <div className={cn(
    "bg-white border p-4 rounded-xl shadow-sm transition-all",
    live ? "border-amber-400 ring-1 ring-amber-100" : "border-gray-200",
    className
  )}>
    {children}
  </div>
);

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

// Map View Adjuster
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [50, 50] });
    }
  }, [positions, map]);
  return null;
}

// MAIN COMPONENT
export default function DriverApp() {
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<"login" | "pin" | "dashboard">("login");
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [curDriver, setCurDriver] = useState<Driver | null>(null);
  const [pin, setPin] = useState("");
  const [activeTab, setActiveTab] = useState("rotas");
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [gpsData, setGpsData] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [absents, setAbsents] = useState<Record<string, boolean>>({});
  
  // Modals
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
  const [newDriverData, setNewDriverData] = useState({ name: "", pin: "" });
  
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [schoolEditId, setSchoolEditId] = useState<string | null>(null);
  const [schoolData, setSchoolData] = useState({ name: "", rua: "", num: "", bairro: "", cidade: "" });

  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeEditId, setRouteEditId] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<{name: string, schoolId: string, stops: any[]}>({ name: "", schoolId: "", stops: [] });

  const gpsWatchRef = useRef<number | null>(null);

  useEffect(() => {
    // Listen for drivers
    const driversRef = ref(db, "drivers");
    onValue(driversRef, (snapshot) => {
      const data = snapshot.val() || {};
      setDrivers(data);
      setLoading(false);

      // Check session
      const saved = localStorage.getItem("ve_session");
      if (saved) {
        try {
          const { driverId, exp } = JSON.parse(saved);
          if (Date.now() < exp && data[driverId]) {
            setCurDriver(data[driverId]);
            setScreen("dashboard");
          }
        } catch (e) { localStorage.removeItem("ve_session"); }
      }
    });

    return () => off(driversRef);
  }, []);

  // Sync current driver with data updates
  useEffect(() => {
    if (curDriver) {
      const driverRef = ref(db, `drivers/${curDriver.id}`);
      onValue(driverRef, (snap) => {
        if (snap.exists()) setCurDriver(snap.val());
      });
      return () => off(driverRef);
    }
  }, [curDriver?.id]);

  const saveSession = (driverId: string, mins: number = 60) => {
    const exp = Date.now() + (mins * 60 * 1000);
    localStorage.setItem("ve_session", JSON.stringify({ driverId, exp }));
  };

  const handleCreateDriver = async () => {
    if (!newDriverData.name || newDriverData.pin.length < 4) return alert("Preencha nome e PIN (mín 4 dígitos)");
    const id = "d" + Date.now();
    await set(ref(db, `drivers/${id}`), { id, ...newDriverData, sessionMins: 480 });
    setShowNewDriverModal(false);
    setNewDriverData({ name: "", pin: "" });
  };

  const loginWithPin = (d: Driver) => {
    setCurDriver(d);
    setPin("");
    setScreen("pin");
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin === curDriver?.pin) {
      saveSession(curDriver.id, curDriver.sessionMins || 480);
      setScreen("dashboard");
    } else {
      alert("PIN incorreto");
      setPin("");
    }
  };

  const handleLogout = () => {
    if (activeRouteId) stopRouteTransmission(activeRouteId);
    localStorage.removeItem("ve_session");
    setCurDriver(null);
    setScreen("login");
  };

  // Route Management
  const getStopsArr = (route: Route) => {
    const arr = Object.values(route.stops || {}).sort((a, b) => a.idx - b.idx);
    return [...arr, { child: route.schoolName, lat: route.schoolLat, lng: route.schoolLng, addr: "", idx: arr.length, isSchool: true }];
  };

  const startRouteTransmission = (routeId: string) => {
    const route = curDriver?.routes?.[routeId];
    if (!route) return;
    
    setActiveRouteId(routeId);
    setActiveTab("transmit");
    setMarks({});
    setAbsents({});
    
    // Reset remote transmission state
    set(ref(db, `active_routes/${curDriver!.id}_${routeId}`), {
      on: true,
      nextStopIdx: 0,
      startTime: Date.now()
    });
    
    // Clear previous absent flags if any
    remove(ref(db, `absent/${curDriver!.id}_${routeId}`));

    // Start GPS
    if (navigator.geolocation) {
      const gpsKey = `gps/${curDriver!.id}_${routeId}`;
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, speed } = pos.coords;
          const spd = speed ? Math.round(speed * 3.6) : 0;
          const data = { lat, lng, spd, ts: Date.now(), on: true };
          set(ref(db, gpsKey), data);
          setGpsData(data);
        },
        (err) => console.error(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
      );
    }
    
    // Log history start
    const dateStr = new Date().toISOString().split('T')[0];
    set(ref(db, `history/${curDriver!.id}/${dateStr}/${routeId}/start`), {
      ts: Date.now(),
      routeName: route.name
    });
  };

  const stopRouteTransmission = (routeId: string) => {
    if (!confirm("Encerrar transmissão da rota?")) return;
    
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    
    const baseKey = `${curDriver!.id}_${routeId}`;
    set(ref(db, `gps/${baseKey}/on`), false);
    set(ref(db, `gps/${baseKey}/finished`), true);
    remove(ref(db, `active_routes/${baseKey}`));
    remove(ref(db, `absent/${baseKey}`));
    
    const dateStr = new Date().toISOString().split('T')[0];
    set(ref(db, `history/${curDriver!.id}/${dateStr}/${routeId}/end`), { ts: Date.now() });
    
    setActiveRouteId(null);
    setGpsData(null);
  };

  const markStopDone = (idx: number, child: string) => {
    const key = `stop${idx}`;
    setMarks(prev => ({ ...prev, [key]: true }));
    
    // Update global next stop index
    const finishedCount = Object.keys({ ...marks, [key]: true }).length;
    // Note: this is simple. Better logic would be tracking order.
    // For now, we assume sequential.
    const nextIdx = idx + 1;
    set(ref(db, `active_routes/${curDriver!.id}_${activeRouteId}/nextStopIdx`), nextIdx);

    // Log to history
    const dateStr = new Date().toISOString().split('T')[0];
    const ts = Date.now();
    set(ref(db, `history/${curDriver!.id}/${dateStr}/${activeRouteId}/stops/${key}`), {
      child,
      ts,
      time: new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });
  };

  const toggleAbsent = (idx: number) => {
    const key = `stop${idx}`;
    const newVal = !absents[key];
    setAbsents(prev => ({ ...prev, [key]: newVal }));
    set(ref(db, `absent/${curDriver!.id}_${activeRouteId}/${key}`), newVal || null);
    
    // If marking as absent, we might need to skip to next stop for ETA
    if (newVal) {
        // Just a simple increment if the currently targeted stop is marked absent
        get(ref(db, `active_routes/${curDriver!.id}_${activeRouteId}/nextStopIdx`)).then(snap => {
            const curNext = snap.val() || 0;
            if (curNext === idx) {
                set(ref(db, `active_routes/${curDriver!.id}_${activeRouteId}/nextStopIdx`), idx + 1);
            }
        });
    }
  };

  // CRUD Geocoding helper
  const geocode = async (addr: string) => {
    // Mock or real geocoding. Using a public free API or Google.
    // Given instructions to use Google API Key if provided, but I'll use a fetch to a typical geocode endpoint or provided logic.
    // The previous app used a placeholder for GKEY. I'll use simple OSM search for safety or Google if I had a key.
    // I will use OSM Nominatim for this demo.
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr + ", Brasil")}`);
        const data = await res.json();
        if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        return null;
    } catch(e) { return null; }
  };

  const saveSchool = async () => {
    const { name, rua, num, bairro, cidade } = schoolData;
    if (!name || !rua || !cidade) return alert("Nome, Rua e Cidade são obrigatórios");
    const addr = `${rua}, ${num}, ${bairro}, ${cidade}`;
    const coords = await geocode(addr);
    if (!coords) return alert("Endereço não encontrado no mapa.");
    
    const id = schoolEditId || "s" + Date.now();
    await set(ref(db, `drivers/${curDriver!.id}/schools/${id}`), { id, ...schoolData, ...coords });
    setShowSchoolModal(false);
    setSchoolData({ name: "", rua: "", num: "", bairro: "", cidade: "" });
  };

  const saveRouteEntry = async () => {
    if (!routeData.name || !routeData.schoolId) return alert("Nome e Escola são obrigatórios");
    const school = curDriver?.schools?.[routeData.schoolId];
    if (!school) return;

    const routeId = routeEditId || "r" + Date.now();
    const stops: Record<string, Stop> = {};
    
    // Geocode stops
    for (let i = 0; i < routeData.stops.length; i++) {
        const s = routeData.stops[i];
        const addr = `${s.rua}, ${s.num}, ${s.bairro}, ${s.cidade}`;
        const coords = s.lat ? { lat: s.lat, lng: s.lng } : (await geocode(addr));
        stops[`stop${i}`] = {
            idx: i,
            ...s,
            addr,
            lat: coords?.lat || school.lat,
            lng: coords?.lng || school.lng
        };
    }

    await set(ref(db, `drivers/${curDriver!.id}/routes/${routeId}`), {
        id: routeId,
        name: routeData.name,
        schoolId: routeData.schoolId,
        schoolName: school.name,
        schoolLat: school.lat,
        schoolLng: school.lng,
        stops
    });
    setShowRouteModal(false);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 gap-4">
      <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-500 font-medium">Carregando VanEscolar...</p>
    </div>
  );

  if (screen === "login") return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-white border-b h-14 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2 font-bold text-lg">
           <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white">
             <Bus size={18} />
           </div>
           Van<span>Escolar</span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-amber-600">
            <User size={32} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Painel do Motorista</h1>
            <p className="text-gray-500 text-sm mt-1">Selecione seu perfil para continuar</p>
          </div>
          
          <div className="space-y-3">
            {Object.values(drivers).map(d => (
              <button
                key={d.id}
                onClick={() => loginWithPin(d)}
                className="flex items-center justify-between w-full p-4 border border-gray-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all group"
              >
                <div className="text-left leading-tight">
                    <p className="font-bold">{d.name}</p>
                    <p className="text-xs text-gray-500">{Object.keys(d.routes || {}).length} rota(s)</p>
                </div>
                <div className="text-gray-300 group-hover:text-amber-500 transition-colors">
                    <Check size={20} />
                </div>
              </button>
            ))}
            
            <Button variant="secondary" className="w-full mt-4" onClick={() => setShowNewDriverModal(true)}>
                <Plus size={18} /> Novo Motorista
            </Button>
          </div>
        </Card>
      </div>

      {showNewDriverModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold">Novo Motorista</h3>
                    <button onClick={() => setShowNewDriverModal(false)}><X size={20}/></button>
                </div>
                <div className="space-y-3">
                   <div>
                       <label className="text-xs font-semibold text-gray-500 block mb-1">Nome</label>
                       <input 
                         className="w-full border rounded-lg p-2.5 outline-none focus:border-amber-500" 
                         placeholder="Seu nome"
                         value={newDriverData.name}
                         onChange={e => setNewDriverData(p => ({...p, name: e.target.value}))}
                       />
                   </div>
                   <div>
                       <label className="text-xs font-semibold text-gray-500 block mb-1">PIN (ex: 1234)</label>
                       <input 
                         type="password"
                         className="w-full border rounded-lg p-2.5 outline-none focus:border-amber-500" 
                         placeholder="Mínimo 4 números"
                         maxLength={6}
                         value={newDriverData.pin}
                         onChange={e => setNewDriverData(p => ({...p, pin: e.target.value}))}
                       />
                   </div>
                </div>
                <Button className="w-full" onClick={handleCreateDriver}>Criar Perfil</Button>
            </Card>
        </div>
      )}
    </div>
  );

  if (screen === "pin") return (
    <div className="flex flex-col min-h-screen items-center justify-center p-6 bg-gray-50">
        <Card className="max-w-xs w-full p-8 text-center space-y-6">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-600">
                <Lock size={24} />
            </div>
            <div>
                <h1 className="text-lg font-bold">{curDriver?.name}</h1>
                <p className="text-gray-500 text-sm">Digite seu PIN de acesso</p>
            </div>
            
            <div className="flex justify-center gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className={cn(
                        "w-4 h-4 rounded-full border-2 transition-all",
                        pin.length > i ? "bg-amber-500 border-amber-500 scale-110" : "border-gray-200"
                    )} />
                ))}
            </div>

            <form onSubmit={handlePinSubmit} className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button 
                        key={n} 
                        type="button"
                        onClick={() => pin.length < 6 && setPin(p => p + n)}
                        className="h-14 bg-white border rounded-xl font-bold text-lg active:bg-gray-100 transition-colors"
                    >
                        {n}
                    </button>
                ))}
                <button 
                    type="button"
                    onClick={() => setScreen("login")}
                    className="h-14 font-medium text-gray-400"
                >
                    Voltar
                </button>
                <button 
                    type="button"
                    onClick={() => pin.length < 6 && setPin(p => p + '0')}
                    className="h-14 bg-white border rounded-xl font-bold text-lg"
                >
                    0
                </button>
                <button 
                    type="button"
                    onClick={() => setPin(p => p.slice(0, -1))}
                    className="h-14 font-medium text-amber-600"
                >
                    ⌫
                </button>
            </form>
        </Card>
    </div>
  );

  const renderTab = () => {
    switch(activeTab) {
        case "rotas":
          return (
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-500 uppercase tracking-wider text-xs">Suas Rotas</h2>
                    <Button size="sm" onClick={() => {
                        setRouteEditId(null);
                        setRouteData({ name: "", schoolId: "", stops: [] });
                        setShowRouteModal(true);
                    }}>+ Nova Rota</Button>
                </div>
                
                <div className="space-y-3">
                    {Object.values(curDriver?.routes || {}).map(r => (
                        <Card key={r.id} live={activeRouteId === r.id}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-bold">{r.name}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {Object.keys(r.stops || {}).length} escalas • {r.schoolName}
                                    </p>
                                </div>
                                {activeRouteId === r.id && <Badge active>Ativa</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                                {activeRouteId !== r.id ? (
                                    <Button size="sm" className="flex-1" onClick={() => startRouteTransmission(r.id)}>
                                        <Play size={14} className="fill-current" /> Começar Rota
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="danger" className="flex-1" onClick={() => stopRouteTransmission(r.id)}>
                                        <Square size={14} className="fill-current" /> Parar
                                    </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => {
                                    setRouteEditId(r.id);
                                    setRouteData({ name: r.name, schoolId: r.schoolId, stops: Object.values(r.stops || {}) });
                                    setShowRouteModal(true);
                                }}>
                                    <Edit2 size={14} />
                                </Button>
                                <Button size="sm" variant="outline" onClick={async () => {
                                    if (confirm("Excluir rota?")) {
                                        await remove(ref(db, `drivers/${curDriver!.id}/routes/${r.id}`));
                                    }
                                }}>
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </Card>
                    ))}

                    {Object.keys(curDriver?.routes || {}).length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                             <MapIcon size={48} className="mx-auto mb-2 opacity-20" />
                             <p>Nenhuma rota cadastrada.</p>
                        </div>
                    )}
                </div>
            </div>
          );
        case "transmit":
          if (!activeRouteId) return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                <div className="bg-gray-100 p-6 rounded-full text-gray-300">
                    <Play size={48} />
                </div>
                <div className="max-w-[200px]">
                    <p className="font-bold">Nenhuma rota ativa</p>
                    <p className="text-sm text-gray-500">Inicie uma rota na aba "Rotas" para transmitir sua posição.</p>
                </div>
            </div>
          );

          const activeRoute = curDriver?.routes?.[activeRouteId];
          const stops = activeRoute ? getStopsArr(activeRoute) : [];

          return (
            <div className="p-4 space-y-4">
                <Card live className="space-y-3">
                   <div className="flex justify-between items-center">
                       <div>
                           <h3 className="font-bold text-amber-900">{activeRoute?.name}</h3>
                           <p className="text-[10px] uppercase font-bold text-amber-700 tracking-widest">Transmitindo GPS</p>
                       </div>
                       <Button size="sm" variant="danger" onClick={() => stopRouteTransmission(activeRouteId)}>Encerrar</Button>
                   </div>
                   <div className="flex items-baseline gap-2">
                       <span className="text-3xl font-mono font-bold">{gpsData?.spd || 0}</span>
                       <span className="text-xs text-gray-500">km/h</span>
                   </div>
                </Card>

                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Escalas da Rota</h4>
                    <div className="relative space-y-4 border-l-2 border-dashed border-gray-100 ml-4 pl-6">
                        {stops.map((s, i) => {
                            const isSchool = s.isSchool;
                            const key = `stop${s.idx}`;
                            const isDone = marks[key];
                            const isAbsent = absents[key];

                            return (
                                <div key={i} className={cn("relative", isAbsent && "opacity-40 grayscale")}>
                                    <div className={cn(
                                        "absolute -left-[35px] top-0 w-4 h-4 rounded-full border-2 bg-white z-10",
                                        isDone ? "bg-green-500 border-green-500" : isAbsent ? "bg-gray-400 border-gray-400" : "border-amber-400"
                                    )} />
                                    
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className={cn("font-bold truncate", isDone && "line-through text-gray-400")}>
                                                {isSchool ? "🏫 " : ""}{s.child}
                                            </p>
                                            <p className="text-[10px] text-gray-500 truncate">{s.rua}, {s.num}</p>
                                        </div>
                                        
                                        <div className="flex shrink-0 gap-1.5">
                                            {!isSchool && !isDone && (
                                                <>
                                                    <Button 
                                                        size="sm" 
                                                        variant={isAbsent ? "secondary" : "outline"}
                                                        className="h-8 w-8 !p-0"
                                                        onClick={() => toggleAbsent(s.idx)}
                                                    >
                                                        {isAbsent ? "✓" : "X"}
                                                    </Button>
                                                </>
                                            )}
                                            {!isDone && !isAbsent && (
                                                <Button size="sm" className="h-8 px-3" onClick={() => markStopDone(s.idx, s.child)}>
                                                    {isSchool ? "Cheguei" : "Ok"}
                                                </Button>
                                            )}
                                            {isDone && <Check className="text-green-500" size={20} />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
          );
        case "alunos":
          return (
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-500 uppercase tracking-wider text-xs">Alunos por Rota</h2>
                    <Button size="sm" onClick={() => setActiveTab("rotas")}>Gerenciar Rotas</Button>
                </div>
                
                <div className="space-y-6">
                    {Object.values(curDriver?.routes || {}).map(r => (
                        <div key={r.id} className="space-y-2">
                             <h4 className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded inline-block">{r.name}</h4>
                             <div className="grid gap-2">
                                {Object.values(r.stops || {}).sort((a,b) => a.idx - b.idx).map(s => {
                                    const shareLink = `${window.location.origin}/?v=parent&d=${curDriver!.id}&r=${r.id}&s=${s.idx}`;
                                    return (
                                        <Card key={s.idx} className="!p-3">
                                            <div className="flex justify-between items-start mb-2">
                                                <p className="font-bold text-sm">{s.child}</p>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="ghost" className="!p-1 h-auto" onClick={() => {
                                                        navigator.clipboard.writeText(shareLink);
                                                        alert("Link copiado!");
                                                    }}>
                                                        <Copy size={16} />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="!p-1 h-auto text-green-600">
                                                        <Phone size={16} />
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mb-2 truncate">{s.addr}</p>
                                            <div className="bg-gray-50 p-1.5 rounded flex items-center gap-2 overflow-hidden">
                                                <p className="text-[9px] font-mono text-gray-400 truncate flex-1 leading-none">{shareLink}</p>
                                            </div>
                                        </Card>
                                    );
                                })}
                             </div>
                        </div>
                    ))}
                </div>
            </div>
          );
        case "escolas":
          return (
            <div className="p-4 space-y-4">
                 <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-500 uppercase tracking-wider text-xs">Escolas Cadastradas</h2>
                    <Button size="sm" onClick={() => {
                        setSchoolEditId(null);
                        setSchoolData({ name: "", rua: "", num: "", bairro: "", cidade: "" });
                        setShowSchoolModal(true);
                    }}>+ Nova Escola</Button>
                </div>
                
                <div className="grid gap-3">
                    {Object.values(curDriver?.schools || {}).map(s => (
                        <Card key={s.id}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold">{s.name}</h3>
                                    <p className="text-xs text-gray-500">{s.rua}, {s.num} - {s.cidade}</p>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        setSchoolEditId(s.id);
                                        setSchoolData({ name: s.name, rua: s.rua || "", num: s.num || "", bairro: s.bairro || "", cidade: s.cidade || "" });
                                        setShowSchoolModal(true);
                                    }}><Edit2 size={14} /></Button>
                                    <Button variant="ghost" size="sm" className="text-red-500" onClick={async () => {
                                        if (confirm("Excluir escola?")) {
                                            await remove(ref(db, `drivers/${curDriver!.id}/schools/${s.id}`));
                                        }
                                    }}><Trash2 size={14} /></Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
          );
        default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto border-x bg-white relative overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b px-4 h-14 flex items-center justify-between shrink-0 sticky top-0 z-50">
            <div className="flex items-center gap-2 font-bold select-none">
                 <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white">
                    <Bus size={18} />
                 </div>
                 <span className="hidden sm:inline">Van<span>Escolar</span></span>
                 <span className="text-gray-400 font-normal">| <span className="text-gray-900">{curDriver?.name}</span></span>
            </div>
            <div className="flex items-center gap-3">
                <Badge active={!!activeRouteId}>{activeRouteId ? "Ao vivo" : "Offline"}</Badge>
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white">
                    {curDriver?.name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors">
                    <LogOut size={20} />
                </button>
            </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            {/* Sidebar List */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r overflow-y-auto bg-gray-50 shrink-0">
                {/* Tabs */}
                <div className="flex border-b sticky top-0 bg-gray-50 z-40">
                    {[
                        { id: "rotas", icon: <MapPin size={16} /> },
                        { id: "transmit", icon: <Play size={16} /> },
                        { id: "alunos", icon: <User size={16} /> },
                        { id: "escolas", icon: <School size={16} /> },
                        { id: "config", icon: <Settings size={16} /> }
                    ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                             "flex-1 flex items-center justify-center h-12 border-b-2 transition-all",
                             activeTab === tab.id ? "border-amber-500 text-amber-600 bg-white" : "border-transparent text-gray-400 hover:text-gray-600"
                          )}
                        >
                          {tab.icon}
                        </button>
                    ))}
                </div>
                
                {renderTab()}
            </div>

            {/* Map Area */}
            <div className="flex-1 relative bg-gray-100 min-h-[300px]">
                <MapContainer center={[-21.177, -47.821]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    {activeRouteId && curDriver?.routes?.[activeRouteId] && (
                        <>
                            {getStopsArr(curDriver.routes[activeRouteId]).map((s, i) => (
                                <Marker 
                                  key={i} 
                                  position={[s.lat, s.lng]} 
                                  icon={createStopIcon(s.isSchool ? '#ef4444' : '#f59e0b', s.isSchool ? "🏫" : String(i+1))} 
                                />
                            ))}
                            <Polyline 
                                positions={getStopsArr(curDriver.routes[activeRouteId]).map(s => [s.lat, s.lng])} 
                                color="#f59e0b" 
                                dashArray="10, 10" 
                                weight={2}
                            />
                            <FitBounds positions={getStopsArr(curDriver.routes[activeRouteId]).map(s => [s.lat, s.lng])} />
                        </>
                    )}

                    {gpsData && (
                        <Marker position={[gpsData.lat, gpsData.lng]} icon={createBusIcon()} zIndexOffset={1000} />
                    )}
                </MapContainer>
                
                {!activeRouteId && (
                    <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none p-6 text-center">
                        <div className="bg-white/90 backdrop-blur border rounded-2xl p-6 shadow-xl space-y-2 max-w-xs">
                             <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500">
                                 <MapIcon size={24} />
                             </div>
                             <h4 className="font-bold">Nenhum percurso ativo</h4>
                             <p className="text-gray-500 text-xs">Inicie uma rota para visualizar o trajeto e os alunos no mapa.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Floating Add Child to Route? Wait, handle via Modals */}
        {showSchoolModal && (
            <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4">
                <Card className="w-full max-w-md p-6 space-y-4">
                    <h3 className="font-bold">{schoolEditId ? "Editar Escola" : "Nova Escola"}</h3>
                    <div className="grid gap-3">
                        <input className="w-full border rounded-lg p-2 text-sm" placeholder="Nome da Escola" value={schoolData.name} onChange={e => setSchoolData(d => ({...d, name: e.target.value}))} />
                        <div className="flex gap-2">
                             <input className="flex-1 border rounded-lg p-2 text-sm" placeholder="Rua" value={schoolData.rua} onChange={e => setSchoolData(d => ({...d, rua: e.target.value}))} />
                             <input className="w-20 border rounded-lg p-2 text-sm" placeholder="Nº" value={schoolData.num} onChange={e => setSchoolData(d => ({...d, num: e.target.value}))} />
                        </div>
                        <div className="flex gap-2">
                             <input className="flex-1 border rounded-lg p-2 text-sm" placeholder="Bairro" value={schoolData.bairro} onChange={e => setSchoolData(d => ({...d, bairro: e.target.value}))} />
                             <input className="flex-1 border rounded-lg p-2 text-sm" placeholder="Cidade" value={schoolData.cidade} onChange={e => setSchoolData(d => ({...d, cidade: e.target.value}))} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setShowSchoolModal(false)}>Cancelar</Button>
                        <Button className="flex-1" onClick={saveSchool}>Salvar Escola</Button>
                    </div>
                </Card>
            </div>
        )}

        {showRouteModal && (
            <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4 overflow-y-auto">
                <Card className="w-full max-w-2xl p-6 space-y-4">
                    <h3 className="font-bold">{routeEditId ? "Editar Rota" : "Nova Rota"}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <input className="w-full border rounded-lg p-2 text-sm" placeholder="Nome da Rota (ex: Manhã)" value={routeData.name} onChange={e => setRouteData(d => ({...d, name: e.target.value}))} />
                        <select 
                            className="w-full border rounded-lg p-2 text-sm" 
                            value={routeData.schoolId}
                            onChange={e => setRouteData(d => ({...d, schoolId: e.target.value}))}
                        >
                            <option value="">Selecione a Escola</option>
                            {Object.values(curDriver?.schools || {}).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Alunos</p>
                        {routeData.stops.map((s, i) => (
                            <div key={i} className="p-3 border rounded-lg bg-gray-50 flex flex-col gap-2 relative">
                                <button className="absolute top-2 right-2 text-red-500" onClick={() => setRouteData(d => ({...d, stops: d.stops.filter((_, idx)=>idx!==i)}))}><X size={14}/></button>
                                <input className="w-full bg-transparent border-b outline-none font-bold text-sm" placeholder="Nome da Criança" value={s.child} onChange={e => {
                                    const nextStops = [...routeData.stops];
                                    nextStops[i].child = e.target.value;
                                    setRouteData(d => ({...d, stops: nextStops}));
                                }} />
                                <div className="flex gap-2">
                                    <input className="flex-1 border rounded p-1.5 text-[10px]" placeholder="Rua" value={s.rua} onChange={e => {
                                        const nextStops = [...routeData.stops];
                                        nextStops[i].rua = e.target.value;
                                        setRouteData(d => ({ ...d, stops: nextStops }));
                                    }} />
                                    <input className="w-12 border rounded p-1.5 text-[10px]" placeholder="Nº" value={s.num} onChange={e => {
                                        const nextStops = [...routeData.stops];
                                        nextStops[i].num = e.target.value;
                                        setRouteData(d => ({ ...d, stops: nextStops }));
                                    }} />
                                    <input className="flex-1 border rounded p-1.5 text-[10px]" placeholder="Cidade" value={s.cidade} onChange={e => {
                                        const nextStops = [...routeData.stops];
                                        nextStops[i].cidade = e.target.value;
                                        setRouteData(d => ({ ...d, stops: nextStops }));
                                    }} />
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" fullWidth onClick={() => setRouteData(d => ({...d, stops: [...d.stops, { child: "", rua: "", num: "", bairro: "", cidade: "" }] }))}>
                            + Adicionar Aluno
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setShowRouteModal(false)}>Cancelar</Button>
                        <Button className="flex-1" onClick={saveRouteEntry}>Salvar Percurso</Button>
                    </div>
                </Card>
            </div>
        )}
    </div>
  );
}
