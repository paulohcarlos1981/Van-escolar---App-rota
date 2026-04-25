import React, { useState, useEffect, useRef } from "react";
import { ref, onValue, set, remove, get, off } from "firebase/database";
import { db } from "../lib/firebase";
import { cn } from "../lib/utils";
import { 
  Bus, Lock, User, Plus, MapPin, School, 
  Settings, LogOut, Trash2, Edit2, Play, Square, Check, X,
  Copy, Map as MapIcon, Eye, EyeOff, ChevronUp, ChevronDown
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
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
  defaultCity?: string;
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

const Card = ({ children, className, live }: { children: React.ReactNode, className?: string, live?: boolean, [key: string]: any }) => (
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

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const valid = positions.filter(p => p && !isNaN(p[0]) && !isNaN(p[1]));
    if (valid.length > 0) {
      map.fitBounds(valid as L.LatLngBoundsLiteral, { padding: [50, 50] });
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
  const [showPin, setShowPin] = useState(false);
  
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
  const [newDriverData, setNewDriverData] = useState({ name: "", pin: "" });
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [schoolEditId, setSchoolEditId] = useState<string | null>(null);
  const [schoolData, setSchoolData] = useState({ name: "", rua: "", num: "", bairro: "", cidade: "" });
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeEditId, setRouteEditId] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<{name: string, schoolId: string, stops: any[]}>({ name: "", schoolId: "", stops: [] });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsData, setSettingsData] = useState({ defaultCity: "" });

  const gpsWatchRef = useRef<number | null>(null);

  useEffect(() => {
    const driversRef = ref(db, "drivers");
    onValue(driversRef, (snapshot) => {
      const data = snapshot.val() || {};
      setDrivers(data);
      setLoading(false);

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

  useEffect(() => {
    if (curDriver) {
      const driverRef = ref(db, `drivers/${curDriver.id}`);
      onValue(driverRef, (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          setCurDriver(data);
          setSettingsData({ defaultCity: data.defaultCity || "" });
        }
      });
      return () => off(driverRef);
    }
  }, [curDriver?.id]);

  const handleCreateDriver = async () => {
    if (!newDriverData.name || newDriverData.pin.length < 4) return alert("Preencha nome e PIN (mín 4 dígitos)");
    const id = "d" + Date.now();
    await set(ref(db, `drivers/${id}`), { id, ...newDriverData, sessionMins: 480 });
    setShowNewDriverModal(false);
  };

  const loginWithPin = (d: Driver) => {
    setCurDriver(d);
    setScreen("pin");
  };

  const handlePinSubmit = () => {
    if (pin === curDriver?.pin) {
      const exp = Date.now() + ((curDriver.sessionMins || 480) * 60 * 1000);
      localStorage.setItem("ve_session", JSON.stringify({ driverId: curDriver.id, exp }));
      setScreen("dashboard");
    } else {
      alert("PIN incorreto");
      setPin("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("ve_session");
    setCurDriver(null);
    setPin("");
    setShowPin(false);
    setScreen("login");
  };

  const handleDeleteDriver = async (e: React.MouseEvent, driverId: string) => {
    e.stopPropagation();
    if (confirm("🚨 ATENÇÃO: Tem certeza que deseja excluir ESTE MOTORISTA? Todos os dados, rotas e escolas vinculados a este perfil serão PERDIDOS PERMANENTEMENTE.")) {
      await remove(ref(db, `drivers/${driverId}`));
    }
  };

  const deleteStudent = async (routeId: string, stopIdx: number) => {
    if (!confirm("Remover este aluno da rota?")) return;
    const route = curDriver?.routes?.[routeId];
    if (!route) return;
    
    const stopsList = Object.values(route.stops || {}) as Stop[];
    const sorted = stopsList.sort((a, b) => a.idx - b.idx);
    const filtered = sorted.filter(s => s.idx !== stopIdx);
    
    const newStops: Record<string, any> = {};
    filtered.forEach((s, i) => {
        newStops[`stop${i}`] = { ...s, idx: i };
    });
    
    await set(ref(db, `drivers/${curDriver!.id}/routes/${routeId}/stops`), newStops);
  };

  const moveStop = async (routeId: string, stopIdx: number, direction: 'up' | 'down') => {
    const route = curDriver?.routes?.[routeId];
    if (!route) return;
    
    const stopsList = Object.values(route.stops || {}) as Stop[];
    const sorted = [...stopsList].sort((a, b) => a.idx - b.idx);
    
    const targetIdx = direction === 'up' ? stopIdx - 1 : stopIdx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    
    // Swap
    const temp = sorted[stopIdx];
    sorted[stopIdx] = sorted[targetIdx];
    sorted[targetIdx] = temp;
    
    const newStops: Record<string, any> = {};
    sorted.forEach((s, i) => {
        newStops[`stop${i}`] = { ...s, idx: i };
    });
    
    await set(ref(db, `drivers/${curDriver!.id}/routes/${routeId}/stops`), newStops);
  };

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
    set(ref(db, `active_routes/${curDriver!.id}_${routeId}`), { on: true, nextStopIdx: 0, startTime: Date.now() });
    remove(ref(db, `absent/${curDriver!.id}_${routeId}`));

    if (navigator.geolocation) {
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, speed } = pos.coords;
          const spd = speed ? Math.round(speed * 3.6) : 0;
          const data = { lat, lng, spd, ts: Date.now(), on: true };
          set(ref(db, `gps/${curDriver!.id}_${routeId}`), data);
          setGpsData(data);
        },
        null,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
      );
    }
    set(ref(db, `history/${curDriver!.id}/${new Date().toISOString().split('T')[0]}/${routeId}/start`), { ts: Date.now(), routeName: route.name });
  };

  const stopRouteTransmission = (routeId: string) => {
    if (!confirm("Encerrar transmissão?")) return;
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    const key = `${curDriver!.id}_${routeId}`;
    set(ref(db, `gps/${key}/on`), false);
    set(ref(db, `gps/${key}/finished`), true);
    remove(ref(db, `active_routes/${key}`));
    setActiveRouteId(null);
    setGpsData(null);
  };

  const markStopDone = (idx: number, child: string) => {
    const key = `stop${idx}`;
    setMarks(prev => ({ ...prev, [key]: true }));
    set(ref(db, `active_routes/${curDriver!.id}_${activeRouteId}/nextStopIdx`), idx + 1);
    const ts = Date.now();
    set(ref(db, `history/${curDriver!.id}/${new Date().toISOString().split('T')[0]}/${activeRouteId}/stops/${key}`), { child, ts, time: new Date(ts).toLocaleTimeString() });
  };

  const toggleAbsent = (idx: number) => {
    const key = `stop${idx}`;
    const newVal = !absents[key];
    setAbsents(prev => ({ ...prev, [key]: newVal }));
    set(ref(db, `absent/${curDriver!.id}_${activeRouteId}/${key}`), newVal || null);
    if (newVal) {
        get(ref(db, `active_routes/${curDriver!.id}_${activeRouteId}/nextStopIdx`)).then(snap => {
            if (snap.val() === idx) set(ref(db, `active_routes/${curDriver!.id}_${activeRouteId}/nextStopIdx`), idx + 1);
        });
    }
  };

  const undoAction = async (idx: number) => {
    const key = `stop${idx}`;
    setMarks(prev => {
        const next = {...prev};
        delete next[key];
        return next;
    });
    setAbsents(prev => {
        const next = {...prev};
        delete next[key];
        return next;
    });
    
    if (activeRouteId) {
        const routeKey = `${curDriver!.id}_${activeRouteId}`;
        await remove(ref(db, `absent/${routeKey}/${key}`));
        
        const snap = await get(ref(db, `active_routes/${routeKey}/nextStopIdx`));
        const current = snap.val() || 0;
        if (idx < current) {
            await set(ref(db, `active_routes/${routeKey}/nextStopIdx`), idx);
        }
    }
  };

  const saveSettings = async () => {
    if (!curDriver) return;
    await set(ref(db, `drivers/${curDriver.id}/defaultCity`), settingsData.defaultCity);
    setShowSettingsModal(false);
  };

  const geocode = async (addr: string) => {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr + ", Brasil")}`);
        const data = await res.json();
        return data?.[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
    } catch(e) { return null; }
  };

  const saveSchool = async () => {
    const { name, rua, num, bairro, cidade } = schoolData;
    if (!name || !rua || !cidade) return alert("Preencha os campos obrigatórios");
    const coords = await geocode(`${rua}, ${num}, ${bairro}, ${cidade}`);
    if (!coords) return alert("Endereço não localizado");
    const id = schoolEditId || "s" + Date.now();
    await set(ref(db, `drivers/${curDriver!.id}/schools/${id}`), { id, ...schoolData, ...coords });
    setShowSchoolModal(false);
  };

  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [activeInputIdx, setActiveInputIdx] = useState<number | null>(null);

  const searchAddress = async (query: string) => {
    if (query.length < 3) {
        setAddressSuggestions([]);
        return;
    }
    try {
        const cityFilter = settingsData.defaultCity ? `, ${settingsData.defaultCity}` : "";
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query + cityFilter + ", Brasil")}&limit=5`);
        const data = await res.json();
        setAddressSuggestions(data);
    } catch (e) {
        console.error(e);
    }
  };

  const selectSuggestion = (sug: any, stopIdx: number) => {
    const ns = [...routeData.stops];
    const addr = sug.address;
    ns[stopIdx] = {
        ...ns[stopIdx],
        rua: addr.road || addr.pedestrian || addr.suburb || "",
        num: addr.house_number || "",
        bairro: addr.suburb || addr.neighbourhood || "",
        cidade: addr.city || addr.town || addr.municipality || settingsData.defaultCity || "",
        lat: parseFloat(sug.lat),
        lng: parseFloat(sug.lon)
    };
    setRouteData(p => ({ ...p, stops: ns }));
    setAddressSuggestions([]);
    setActiveInputIdx(null);
  };

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<{routeId: string, stopIdx: number | null, data: any} | null>(null);

  const openAddStudent = () => {
    setEditingStudent({
        routeId: activeRouteId || (curDriver?.routes ? Object.keys(curDriver.routes)[0] : ""),
        stopIdx: null,
        data: { child: "", rua: "", num: "", bairro: "", cidade: settingsData.defaultCity || "", schoolId: "" }
    });
    setShowStudentModal(true);
  };

  const saveStudent = async () => {
    if (!editingStudent || !editingStudent.routeId || !editingStudent.data.child || !editingStudent.data.schoolId) {
        alert("Preencha nome, rota e escola.");
        return;
    }
    
    const route = curDriver?.routes?.[editingStudent.routeId];
    if (!route) return;

    const s = editingStudent.data;
    const searchAddr = `${s.rua}, ${s.num}, ${s.bairro}, ${s.cidade}`;
    const coords = s.lat ? { lat: s.lat, lng: s.lng } : (await geocode(searchAddr));
    
    const stopsList = Object.values(route.stops || {}) as Stop[];
    let newIdx = editingStudent.stopIdx;
    
    if (newIdx === null) {
        newIdx = stopsList.length;
    }

    const newStop = {
        ...s,
        idx: newIdx,
        addr: searchAddr,
        lat: coords?.lat || route.schoolLat,
        lng: coords?.lng || route.schoolLng
    };

    await set(ref(db, `drivers/${curDriver!.id}/routes/${editingStudent.routeId}/stops/stop${newIdx}`), newStop);
    setShowStudentModal(false);
    setEditingStudent(null);
  };

  const saveRouteEntry = async () => {
    if (!routeData.name || !routeData.schoolId) return alert("Nome e escola obrigatórios");
    const school = curDriver?.schools?.[routeData.schoolId];
    if (!school) return;
    const routeId = routeEditId || "r" + Date.now();
    const stops: Record<string, Stop> = {};
    for (let i = 0; i < routeData.stops.length; i++) {
        const s = routeData.stops[i];
        // For geocoding, we construct a better address string
        const searchAddr = `${s.rua}, ${s.num}, ${s.bairro}, ${s.cidade}`;
        const coords = s.lat ? { lat: s.lat, lng: s.lng } : (await geocode(searchAddr));
        
        stops[`stop${i}`] = { 
            idx: i, 
            ...s, 
            addr: searchAddr, 
            lat: coords?.lat || school.lat, 
            lng: coords?.lng || school.lng 
        };
    }
    await set(ref(db, `drivers/${curDriver!.id}/routes/${routeId}`), { id: routeId, name: routeData.name, schoolId: routeData.schoolId, schoolName: school.name, schoolLat: school.lat, schoolLng: school.lng, stops });
    setShowRouteModal(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center">Carregando...</div>;

  if (screen === "login") return (
    <div className="flex flex-col min-h-screen bg-gray-50 items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600"><Bus size={32} /></div>
            <h1 className="text-2xl font-bold">VanEscolar</h1>
            <div className="space-y-3">
                {Object.values(drivers).map((d: any) => (
                    <div key={d.id} className="relative group">
                        <button onClick={() => loginWithPin(d)} className="w-full text-left p-4 border rounded-xl hover:border-amber-400 hover:bg-amber-50 flex justify-between pr-12 transition-all">
                            <div className="min-w-0">
                                <p className="font-bold truncate">{d.name}</p>
                                <p className="text-xs text-gray-500">{Object.keys(d.routes || {}).length} rota(s)</p>
                            </div>
                            <span className="text-amber-500 shrink-0">→</span>
                        </button>
                        <button 
                            onClick={(e) => handleDeleteDriver(e, d.id)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-red-300 hover:text-red-600 transition-colors opacity-40 group-hover:opacity-100"
                            title="Excluir motorista"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
                <Button variant="outline" fullWidth className="mt-4" onClick={() => setShowNewDriverModal(true)}>+ Novo Motorista</Button>
            </div>
        </Card>
        {showNewDriverModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <Card className="w-full max-w-sm p-6 space-y-4">
                    <h3 className="font-bold">Novo Perfil</h3>
                    <input className="w-full border p-2 rounded" placeholder="Nome" value={newDriverData.name} onChange={e => setNewDriverData(p => ({...p, name: e.target.value}))} />
                    <input type="password" className="w-full border p-2 rounded" placeholder="PIN de 4 dígitos" maxLength={4} value={newDriverData.pin} onChange={e => setNewDriverData(p => ({...p, pin: e.target.value}))} />
                    <Button fullWidth onClick={handleCreateDriver}>Criar</Button>
                    <Button variant="ghost" fullWidth onClick={() => setShowNewDriverModal(false)}>Cancelar</Button>
                </Card>
            </div>
        )}
    </div>
  );

  if (screen === "pin") return (
    <div className="h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-xs p-8 text-center space-y-6">
            <div>
                <h2 className="font-bold text-xl">{curDriver?.name}</h2>
                <p className="text-xs text-gray-400 mt-1">Digite seu PIN de acesso</p>
            </div>
            
            <div className="relative">
                <input 
                    type={showPin ? "text" : "password"} 
                    autoFocus
                    placeholder="••••"
                    className="w-full bg-gray-100 text-center text-3xl tracking-[0.5em] p-4 rounded-xl border-2 border-transparent focus:border-amber-400 outline-none font-mono transition-all" 
                    maxLength={4} 
                    value={pin} 
                    onChange={e => setPin(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                />
                <button 
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-amber-500 transition-colors"
                >
                    {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>

            <div className="space-y-3">
                <Button fullWidth size="lg" onClick={handlePinSubmit}>Entrar no Painel</Button>
                <button 
                    onClick={() => {
                        setScreen("login");
                        setPin("");
                        setShowPin(false);
                    }} 
                    className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
                >
                    Trocar Perfil de Motorista
                </button>
            </div>
        </Card>
    </div>
  );

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto bg-white border-x">
        <header className="h-14 border-b flex items-center px-4 justify-between sticky top-0 z-[1000] bg-white">
            <div className="flex items-center gap-2 font-bold text-lg text-amber-600"><Bus /> {curDriver?.name || "VanEscolar"}</div>
            <div className="flex items-center gap-2">
                <Badge active={!!activeRouteId}>{activeRouteId ? "A Caminho" : "Offline"}</Badge>
                <button onClick={() => setShowSettingsModal(true)} className="p-2 text-gray-400 hover:text-amber-500 transition-colors"><Settings size={20}/></button>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={20}/></button>
            </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className={cn(
                "w-full border-r bg-gray-50 overflow-y-auto shrink-0 transition-all",
                activeTab === "rotas" ? "md:w-80" : "flex-1"
            )}>
                <div className="flex border-b sticky top-0 bg-gray-50 z-10">
                    {["rotas", "transmit", "alunos", "escolas"].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn("flex-1 h-12 text-[10px] uppercase font-bold tracking-widest border-b-2", activeTab === tab ? "border-amber-500 text-amber-600 bg-white" : "border-transparent text-gray-400")}
                        >
                            {tab === "transmit" ? "Ao Vivo" : tab}
                        </button>
                    ))}
                </div>

                <div className="p-4 space-y-4">
                    {activeTab === "rotas" && (
                        <>
                            <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-400">ROTAS</span><Button size="sm" onClick={() => { setRouteEditId(null); setRouteData({name: "", schoolId: "", stops: []}); setShowRouteModal(true); }}>+</Button></div>
                            {Object.values(curDriver?.routes || {}).map((r: any) => (
                                <Card key={r.id} live={activeRouteId === r.id} className="space-y-4">
                                    <div><p className="font-bold">{r.name}</p><p className="text-[10px] text-gray-400">{Object.keys(r.stops || {}).length} paradas • {r.schoolName}</p></div>
                                    <div className="flex gap-2">
                                        {activeRouteId === r.id ? <Button size="sm" variant="danger" fullWidth onClick={() => stopRouteTransmission(r.id)}>Parar</Button> : <Button size="sm" fullWidth onClick={() => startRouteTransmission(r.id)}>Iniciar</Button>}
                                        <Button size="sm" variant="outline" onClick={() => { setRouteEditId(r.id); setRouteData({name: r.name, schoolId: r.schoolId, stops: Object.values(r.stops || {})}); setShowRouteModal(true); }}><Edit2 size={14}/></Button>
                                        <Button size="sm" variant="outline" className="text-red-500" onClick={() => confirm("Remover rota?") && remove(ref(db, `drivers/${curDriver!.id}/routes/${r.id}`)) }><Trash2 size={14}/></Button>
                                    </div>
                                </Card>
                            ))}
                        </>
                    )}

                    {activeTab === "transmit" && (
                        activeRouteId ? (
                            <div className="space-y-4">
                                <Card live className="text-center"><p className="text-3xl font-mono font-bold">{gpsData?.spd || 0}</p><p className="text-[10px] font-bold text-gray-400 uppercase">km/h</p></Card>
                                <div className="space-y-3">
                                    {getStopsArr(curDriver!.routes![activeRouteId]).map((s, i) => {
                                        const done = marks[`stop${s.idx}`];
                                        const abs = absents[`stop${s.idx}`];
                                        return (
                                            <div key={i} className={cn("flex flex-col gap-2 p-3 rounded-xl border transition-all", done ? "bg-green-50 border-green-200" : abs ? "bg-red-50 border-red-100 opacity-80" : "bg-white")}>
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", done ? "bg-green-500 text-white" : abs ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500")}>
                                                        {done ? "✓" : abs ? "!" : i+1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={cn("text-sm font-bold truncate", (done || abs) && "text-gray-500")}>
                                                            {s.isSchool ? "🏫 " : ""}{s.child}
                                                        </p>
                                                        {abs && <p className="text-[10px] text-red-500 font-bold uppercase">Faltou hoje</p>}
                                                    </div>
                                                    {(done || abs) && (
                                                        <button onClick={() => undoAction(s.idx)} className="text-[10px] text-gray-400 font-black hover:text-gray-600 uppercase tracking-tighter">Desfazer</button>
                                                    )}
                                                </div>
                                                
                                                {!s.isSchool && !done && !abs && (
                                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                                        <Button size="sm" variant="danger" className="text-xs h-9 py-0" onClick={() => toggleAbsent(s.idx)}>Faltou</Button>
                                                        <Button size="sm" className="text-xs h-9 py-0 bg-green-500 hover:bg-green-600 text-white" onClick={() => markStopDone(s.idx, s.child)}>Chegou</Button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : <p className="text-center text-gray-400 py-12">Nenhuma rota ativa</p>
                    )}

                    {activeTab === "alunos" && (
                        <div className="space-y-6">
                            <div className="px-4 pt-4">
                                <Button fullWidth className="bg-amber-600 hover:bg-amber-700 text-white" onClick={openAddStudent}>
                                    <Plus size={16} className="mr-2" /> Novo Aluno
                                </Button>
                            </div>
                            {Object.values(curDriver?.routes || {}).map((r: any) => {
                                const stopsSorted = Object.values(r.stops || {}).sort((a: any, b: any) => a.idx - b.idx);
                                return (
                                    <div key={r.id} className="space-y-2">
                                        <div className="flex justify-between items-center px-4">
                                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{r.name}</p>
                                            <span className="text-[9px] text-gray-400 uppercase">{stopsSorted.length} alunos</span>
                                        </div>
                                        <div className="space-y-1.5 px-4">
                                            {stopsSorted.map((s: any, idx: number) => {
                                                const link = `${window.location.origin}/?v=parent&d=${curDriver!.id}&r=${r.id}&s=${s.idx}`;
                                                return (
                                                    <Card key={s.idx} className="!p-2.5 text-sm flex justify-between items-center group hover:border-amber-200 transition-all">
                                                        <div className="flex items-center gap-2 mr-2">
                                                            <div className="flex flex-col gap-0.5">
                                                                <button 
                                                                    disabled={idx === 0}
                                                                    onClick={() => moveStop(r.id, idx, 'up')}
                                                                    className="p-0.5 text-gray-300 hover:text-amber-500 disabled:opacity-0"
                                                                >
                                                                    <ChevronUp size={14} />
                                                                </button>
                                                                <button 
                                                                    disabled={idx === stopsSorted.length - 1}
                                                                    onClick={() => moveStop(r.id, idx, 'down')}
                                                                    className="p-0.5 text-gray-300 hover:text-amber-500 disabled:opacity-0"
                                                                >
                                                                    <ChevronDown size={14} />
                                                                </button>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="font-bold block truncate">{s.child}</span>
                                                                <span className="text-[10px] text-gray-400 truncate block">{s.rua}, {s.num} {s.bairro ? `- ${s.bairro}` : ""}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1 items-center shrink-0 ml-2">
                                                            <button 
                                                                onClick={() => { navigator.clipboard.writeText(link); alert("Link do responsável copiado!"); }}
                                                                className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors"
                                                                title="Copiar link"
                                                            >
                                                                <Copy size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => { 
                                                                    setEditingStudent({
                                                                        routeId: r.id,
                                                                        stopIdx: s.idx,
                                                                        data: { ...s }
                                                                    });
                                                                    setShowStudentModal(true);
                                                                }}
                                                                className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                                                                title="Editar dados"
                                                            >
                                                                <Edit2 size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => deleteStudent(r.id, s.idx)}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                                title="Remover aluno"
                                                            >
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        </div>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === "escolas" && (
                        <>
                            <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-400 uppercase">Escolas</span><Button size="sm" onClick={() => { setSchoolEditId(null); setSchoolData({name:"",rua:"",num:"",bairro:"",cidade:""}); setShowSchoolModal(true); }}>+</Button></div>
                            {Object.values(curDriver?.schools || {}).map((s: any) => (
                                <Card key={s.id} className="flex justify-between items-center">
                                    <div className="min-w-0"><p className="font-bold truncate">{s.name}</p><p className="text-[10px] text-gray-400 truncate">{s.rua}, {s.num}</p></div>
                                    <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setSchoolEditId(s.id); setSchoolData(s as any); setShowSchoolModal(true); }}><Edit2 size={14}/></Button><Button variant="ghost" size="sm" className="text-red-500" onClick={() => remove(ref(db, `drivers/${curDriver!.id}/schools/${s.id}`)) }><Trash2 size={14}/></Button></div>
                                </Card>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {activeTab === "rotas" && (
                <div className="flex-1 relative min-h-[300px] z-0">
                    <MapContainer center={[-21.177, -47.821]} zoom={13} style={{ height: "100%", width: "100%" }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {activeRouteId && curDriver?.routes?.[activeRouteId] && (
                            <>
                                {getStopsArr(curDriver.routes[activeRouteId]).map((s, i) => (
                                    <Marker key={i} position={[s.lat, s.lng]} icon={createStopIcon(s.isSchool ? "#ef4444" : "#f59e0b", s.isSchool ? "🏫" : String(i+1))} />
                                ))}
                                <Polyline positions={getStopsArr(curDriver.routes[activeRouteId]).map(s => [s.lat, s.lng])} color="#f59e0b" dashArray="5,5" weight={2} />
                                <FitBounds positions={getStopsArr(curDriver.routes[activeRouteId]).map(s => [s.lat, s.lng])} />
                            </>
                        )}
                        {gpsData?.lat && <Marker position={[gpsData.lat, gpsData.lng]} icon={createBusIcon()} zIndexOffset={1000} />}
                    </MapContainer>
                </div>
            )}
        </div>

        {showSettingsModal && (
            <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
                <Card className="w-full max-w-sm p-6 space-y-4">
                    <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <Settings size={20} />
                        <h3 className="font-bold">Configurações do Perfil</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Cidade Padrão de Atendimento</label>
                            <input 
                                className="w-full border p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" 
                                placeholder="Ex: Ribeirão Preto" 
                                value={settingsData.defaultCity} 
                                onChange={e => setSettingsData(p => ({...p, defaultCity: e.target.value}))} 
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Esta cidade será sugerida automaticamente nos novos cadastros.</p>
                        </div>
                    </div>
                    <div className="pt-2 flex gap-2">
                        <Button variant="ghost" className="flex-1" onClick={() => setShowSettingsModal(false)}>Cancelar</Button>
                        <Button className="flex-1" onClick={saveSettings}>Salvar</Button>
                    </div>
                </Card>
            </div>
        )}

        {showStudentModal && editingStudent && (
            <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
                <Card className="w-full max-w-sm p-6 space-y-4">
                    <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <Plus size={20} />
                        <h3 className="font-bold">{editingStudent.stopIdx === null ? "Novo Aluno" : "Editar Aluno"}</h3>
                    </div>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Nome da Criança</label>
                            <input 
                                className="w-full border p-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20" 
                                placeholder="Nome completo" 
                                value={editingStudent.data.child} 
                                onChange={e => setEditingStudent(p => ({...p!, data: {...p!.data, child: e.target.value}}))} 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Período / Rota</label>
                                <select 
                                    className="w-full border p-2.5 rounded-xl text-xs bg-white outline-none"
                                    value={editingStudent.routeId}
                                    onChange={e => setEditingStudent(p => ({...p!, routeId: e.target.value}))}
                                >
                                    <option value="">Selecione...</option>
                                    {Object.values(curDriver?.routes || {}).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Escola</label>
                                <select 
                                    className="w-full border p-2.5 rounded-xl text-xs bg-white outline-none"
                                    value={editingStudent.data.schoolId}
                                    onChange={e => setEditingStudent(p => ({...p!, data: {...p!.data, schoolId: e.target.value}}))}
                                >
                                    <option value="">Selecione...</option>
                                    {Object.values(curDriver?.schools || {}).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="relative">
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Rua / Logradouro (Pesquisa Automática)</label>
                            <input 
                                className="w-full border p-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20" 
                                placeholder="Digite a rua..." 
                                value={editingStudent.data.rua}
                                onChange={e => {
                                    const val = e.target.value;
                                    setEditingStudent(p => ({...p!, data: {...p!.data, rua: val}}));
                                    searchAddress(val);
                                    setActiveInputIdx(-1);
                                }}
                                onBlur={() => setTimeout(() => setActiveInputIdx(null), 200)}
                            />
                            {activeInputIdx === -1 && addressSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-xl z-50 mt-1 max-h-40 overflow-auto">
                                    {addressSuggestions.map((s, i) => (
                                        <button 
                                            key={i} 
                                            className="w-full text-left p-3 text-xs hover:bg-amber-50 border-b last:border-0"
                                            onClick={() => {
                                                const addr = s.address;
                                                setEditingStudent(p => ({
                                                    ...p!,
                                                    data: {
                                                        ...p!.data,
                                                        rua: addr.road || addr.pedestrian || addr.suburb || editingStudent.data.rua,
                                                        num: addr.house_number || "",
                                                        bairro: addr.suburb || addr.neighbourhood || "",
                                                        cidade: addr.city || addr.town || addr.municipality || settingsData.defaultCity || "",
                                                        lat: parseFloat(s.lat),
                                                        lng: parseFloat(s.lon)
                                                    }
                                                }));
                                                setAddressSuggestions([]);
                                                setActiveInputIdx(null);
                                            }}
                                        >
                                            <p className="font-bold">{s.display_name}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-4">
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Nº</label>
                                <input 
                                    className="w-full border p-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20" 
                                    placeholder="Ex: 123" 
                                    value={editingStudent.data.num}
                                    onChange={e => setEditingStudent(p => ({...p!, data: {...p!.data, num: e.target.value}}))}
                                />
                            </div>
                            <div className="col-span-8">
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Bairro</label>
                                <input 
                                    className="w-full border p-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20" 
                                    placeholder="Nome do bairro" 
                                    value={editingStudent.data.bairro}
                                    onChange={e => setEditingStudent(p => ({...p!, data: {...p!.data, bairro: e.target.value}}))}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Cidade</label>
                            <input 
                                className="w-full border p-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/20" 
                                placeholder="Cidade" 
                                value={editingStudent.data.cidade}
                                onChange={e => setEditingStudent(p => ({...p!, data: {...p!.data, cidade: e.target.value}}))}
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex gap-2">
                        <Button variant="ghost" className="flex-1" onClick={() => { setShowStudentModal(false); setEditingStudent(null); }}>Cancelar</Button>
                        <Button className="flex-1" onClick={saveStudent}>Salvar Aluno</Button>
                    </div>
                </Card>
            </div>
        )}

        {showSchoolModal && (
            <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
                <Card className="w-full max-w-sm p-6 space-y-4">
                    <h3 className="font-bold">Cadastro de Escola</h3>
                    <input className="w-full border p-2 rounded text-sm" placeholder="Nome" value={schoolData.name} onChange={e => setSchoolData(p=>({...p, name: e.target.value}))}/>
                    <input className="w-full border p-2 rounded text-sm" placeholder="Rua" value={schoolData.rua} onChange={e => setSchoolData(p=>({...p, rua: e.target.value}))}/>
                    <div className="flex gap-2">
                        <input className="w-20 border p-2 rounded text-sm" placeholder="Nº" value={schoolData.num} onChange={e => setSchoolData(p=>({...p, num: e.target.value}))}/>
                        <input className="flex-1 border p-2 rounded text-sm" placeholder="Cidade" value={schoolData.cidade} onChange={e => setSchoolData(p=>({...p, cidade: e.target.value}))}/>
                    </div>
                    <Button fullWidth onClick={saveSchool}>Salvar</Button>
                    <Button variant="ghost" fullWidth onClick={() => setShowSchoolModal(false)}>Cancelar</Button>
                </Card>
            </div>
        )}

        {showRouteModal && (
            <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 overflow-y-auto">
                <Card className="w-full max-w-md p-6 space-y-4">
                    <h3 className="font-bold">Rota</h3>
                    <input className="w-full border p-2 rounded text-sm" placeholder="Nome da Rota" value={routeData.name} onChange={e => setRouteData(p=>({...p, name:e.target.value}))}/>
                    <select className="w-full border p-2 rounded text-sm" value={routeData.schoolId} onChange={e => setRouteData(p=>({...p, schoolId:e.target.value}))}>
                        <option value="">Selecione a Escola</option>
                        {Object.values(curDriver?.schools || {}).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
                        {routeData.stops.map((s,i) => (
                            <div key={i} className="p-3 border rounded-xl text-xs bg-gray-50 relative group transition-all hover:border-amber-200">
                                <button 
                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" 
                                    onClick={() => setRouteData(p=>({...p, stops: p.stops.filter((_,idx)=>idx!==i)}))}
                                    title="Remover parada"
                                >
                                    <X size={16} />
                                </button>
                                <div className="space-y-2 mt-1">
                                    <div className="flex items-center gap-2">
                                        <User size={12} className="text-amber-500 shrink-0" />
                                        <input className="flex-1 bg-transparent font-bold outline-none border-b border-transparent focus:border-amber-200" placeholder="Nome da Criança" value={s.child} onChange={e => { const ns=[...routeData.stops]; (ns[i] as any).child=e.target.value; setRouteData(p=>({...p, stops: ns})); }} />
                                    </div>
                                    <div className="relative">
                                        <div className="flex items-center gap-2">
                                            <MapPin size={12} className="text-gray-400 shrink-0" />
                                            <input 
                                                className="flex-1 bg-transparent text-[11px] outline-none border-b border-transparent focus:border-amber-200" 
                                                placeholder="Pesquisar endereço..." 
                                                value={s.rua}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const ns = [...routeData.stops];
                                                    (ns[i] as any).rua = val;
                                                    setRouteData(p => ({ ...p, stops: ns }));
                                                    searchAddress(val);
                                                    setActiveInputIdx(i);
                                                }}
                                                onBlur={() => setTimeout(() => setActiveInputIdx(null), 200)}
                                            />
                                        </div>
                                        {activeInputIdx === i && addressSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 bg-white border rounded shadow-lg z-50 mt-1 max-h-32 overflow-auto">
                                                {addressSuggestions.map((sug, idx) => (
                                                    <button 
                                                        key={idx} 
                                                        className="w-full text-left p-2 text-[10px] hover:bg-amber-50 border-b last:border-0"
                                                        onClick={() => selectSuggestion(sug, i)}
                                                    >
                                                        {sug.display_name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-12 gap-2 pl-5">
                                        <div className="col-span-8">
                                            <input className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-amber-200" placeholder="Rua / Logradouro" value={s.rua} onChange={e => { const ns=[...routeData.stops]; (ns[i] as any).rua=e.target.value; setRouteData(p=>({...p, stops: ns})); }} />
                                        </div>
                                        <div className="col-span-4">
                                            <input className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-amber-200" placeholder="Nº" value={s.num} onChange={e => { const ns=[...routeData.stops]; (ns[i] as any).num=e.target.value; setRouteData(p=>({...p, stops: ns})); }} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-12 gap-2 pl-5">
                                        <div className="col-span-6">
                                            <input className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-amber-200" placeholder="Bairro" value={s.bairro} onChange={e => { const ns=[...routeData.stops]; (ns[i] as any).bairro=e.target.value; setRouteData(p=>({...p, stops: ns})); }} />
                                        </div>
                                        <div className="col-span-6">
                                            <input className="w-full bg-transparent text-[11px] outline-none border-b border-transparent focus:border-amber-200" placeholder="Cidade" value={s.cidade} onChange={e => { const ns=[...routeData.stops]; (ns[i] as any).cidade=e.target.value; setRouteData(p=>({...p, stops: ns})); }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" fullWidth className="h-10 border-dashed border-2 hover:bg-amber-50 hover:border-amber-300" onClick={() => setRouteData(p=>({...p, stops: [...p.stops, {child:"", rua:"", num:"", bairro: "", cidade: settingsData.defaultCity || ""}]}))}>
                            <Plus size={16} /> Adicionar Aluno
                        </Button>
                    </div>
                    <Button fullWidth onClick={saveRouteEntry}>Salvar Percurso</Button>
                    <Button variant="ghost" fullWidth onClick={() => setShowRouteModal(false)}>Cancelar</Button>
                </Card>
            </div>
        )}
    </div>
  );
}
