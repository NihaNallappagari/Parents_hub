import { useState, useEffect, useRef } from "react";
import {
  Bell, MessageSquare, MapPin, Award, Star, Send, Share2,
  CheckCircle, AlertCircle, Info, X, Plus, ChevronLeft,
  Home, User, Clock, LogOut, Eye, EyeOff,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = {
  async post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
  },
  async get(path) {
    const res = await fetch(`${API}${path}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
  },
  async patch(path) {
    const res = await fetch(`${API}${path}`, { method: "PATCH" });
    return res.json();
  },
};

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

const PRIORITY = {
  "Emergency Medical": {
    badge: "bg-red-100 text-red-700 border border-red-200",
    border: "border-l-4 border-l-red-500",
    icon: <AlertCircle size={12} />,
    dot: "bg-red-500",
    emoji: "🚨",
    desc: "Urgent health-related needs",
    gradient: "from-red-600 to-rose-500",
  },
  "Important": {
    badge: "bg-amber-100 text-amber-700 border border-amber-200",
    border: "border-l-4 border-l-amber-500",
    icon: <Info size={12} />,
    dot: "bg-amber-500",
    emoji: "⚡",
    desc: "Time-sensitive but not emergency",
    gradient: "from-amber-500 to-orange-400",
  },
  "General": {
    badge: "bg-blue-100 text-blue-700 border border-blue-200",
    border: "",
    icon: <MessageSquare size={12} />,
    dot: "bg-blue-500",
    emoji: "💬",
    desc: "Questions, offers & resources",
    gradient: "from-indigo-600 to-blue-500",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const fmtPhone = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

function validateSignup(form, zipStatus) {
  const errs = {};
  if (!form.name.trim()) errs.name = "Full name is required.";
  else if (!/^[a-zA-Z\s'\-]+$/.test(form.name)) errs.name = "Name can only contain letters.";
  if (!form.display_name.trim()) errs.display_name = "Display name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Enter a valid email address.";
  if (form.password.length < 8) errs.password = "Password must be at least 8 characters.";
  const digits = form.phone.replace(/\D/g, "");
  if (digits.length !== 10) errs.phone = "Phone number must be exactly 10 digits.";
  if (!form.location.city.trim()) errs.city = "City is required.";
  else if (!/^[a-zA-Z\s'\-\.]+$/.test(form.location.city)) errs.city = "City name can only contain letters.";
  if (!form.location.state) errs.state = "Please select a state.";
  if (!form.location.zip) errs.zip = "ZIP code is required.";
  else if (zipStatus === "checking") errs.zip = "Validating ZIP code…";
  else if (zipStatus === "invalid") errs.zip = "Invalid ZIP code. Enter a valid US ZIP.";
  else if (zipStatus !== "valid") errs.zip = "Please enter a valid 5-digit ZIP code.";
  if (form.kids.length === 0) errs.kids = "Please add at least one child.";
  if (!form.id_verified) errs.id_verified = "You must verify your ID to join.";
  return errs;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
      <AlertCircle size={11} className="shrink-0" />{msg}
    </p>
  );
}

function Avatar({ emoji = "👤", size = "md" }) {
  const sz = { xs: "w-8 h-8 text-sm", sm: "w-10 h-10 text-lg", md: "w-11 h-11 text-xl", lg: "w-16 h-16 text-3xl", xl: "w-24 h-24 text-5xl" }[size];
  return (
    <div className={`${sz} rounded-full bg-indigo-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0`}>
      {emoji}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
      <p className="text-sm text-gray-400">Loading…</p>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [screen, setScreen] = useState("auth");
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("parentshub_session");
    if (saved) {
      const { user, token } = JSON.parse(saved);
      setCurrentUser(user);
      setToken(token);
      setScreen("home");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const notifs = await api.get(`/notifications/${token}`);
        setUnreadCount(notifs.filter(n => !n.read).length);
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [token]);

  const showError = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  const handleLogin = (user, tok) => {
    setCurrentUser(user);
    setToken(tok);
    localStorage.setItem("parentshub_session", JSON.stringify({ user, token: tok }));
    setScreen("home");
  };

  const handleLogout = () => {
    localStorage.removeItem("parentshub_session");
    setCurrentUser(null);
    setToken(null);
    setScreen("auth");
  };

  const navigate = (s, post = null, user = null) => {
    setSelectedPost(post);
    setSelectedUser(user);
    setScreen(s);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] max-w-sm animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 bg-red-600 text-white rounded-xl shadow-xl">
            <AlertCircle size={18} className="shrink-0" />
            <span className="text-sm flex-1">{toast}</span>
            <button onClick={() => setToast(null)}><X size={16} /></button>
          </div>
        </div>
      )}

      {screen === "auth" && <AuthScreen onLogin={handleLogin} showError={showError} />}

      {screen !== "auth" && currentUser && (
        <AppShell
          currentUser={currentUser} token={token} screen={screen}
          navigate={navigate} unreadCount={unreadCount}
          onLogout={handleLogout} showError={showError}
          selectedPost={selectedPost} selectedUser={selectedUser}
        />
      )}
    </div>
  );
}

// ── App Shell (layout with sidebar) ──────────────────────────────────────────

function AppShell({ currentUser, token, screen, navigate, unreadCount, onLogout, showError, selectedPost, selectedUser }) {
  return (
    <>
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center px-4 shadow-sm">
        <div className="flex items-center gap-2 w-56 shrink-0">
          <span className="text-2xl">👨‍👩‍👧‍👦</span>
          <span className="text-xl font-extrabold text-indigo-600 tracking-tight">ParentsHub</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button onClick={() => navigate("notifications")}
            className="relative w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition">
            <Bell size={20} className="text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => navigate("profile", null, null)}
            className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-xl transition">
            {currentUser.profile_picture}
          </button>
        </div>
      </header>

      <div className="flex pt-14 min-h-screen">
        {/* Left Sidebar */}
        <aside className="fixed top-14 left-0 bottom-0 w-60 bg-white border-r border-gray-200 hidden lg:flex flex-col p-3 gap-1 overflow-y-auto z-20">
          <SidebarBtn icon={<Home size={20} />} label="Home" active={screen === "home"} onClick={() => navigate("home")} />
          <SidebarBtn icon={<Bell size={20} />} label="Notifications" active={screen === "notifications"} badge={unreadCount} onClick={() => navigate("notifications")} />
          <SidebarBtn icon={<User size={20} />} label="Profile" active={screen === "profile"} onClick={() => navigate("profile", null, null)} />

          <div className="mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => navigate("newPost")}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition">
              <Plus size={18} /> New Request
            </button>
          </div>

          <div className="mt-auto pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <span className="text-xl">{currentUser.profile_picture}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{currentUser.display_name}</p>
                <p className="text-xs text-gray-400 truncate">{currentUser.location?.city}</p>
              </div>
            </div>
            <button onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition text-sm font-medium">
              <LogOut size={16} /> Log Out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 lg:ml-60 pb-16 lg:pb-0">
          {screen === "home"         && <HomeScreen currentUser={currentUser} token={token} navigate={navigate} showError={showError} />}
          {screen === "newPost"      && <NewPostScreen token={token} onBack={() => navigate("home")} onPosted={() => navigate("home")} showError={showError} />}
          {screen === "postDetail"   && selectedPost && <PostDetailScreen postId={selectedPost.id} token={token} currentUser={currentUser} onBack={() => navigate("home")} onMessageUser={u => navigate("chat", null, u)} showError={showError} />}
          {screen === "notifications"&& <NotificationsScreen token={token} onBack={() => navigate("home")} onViewPost={p => navigate("postDetail", p)} navigate={navigate} showError={showError} />}
          {screen === "chat"         && selectedUser && <ChatScreen currentUser={currentUser} token={token} otherUser={selectedUser} onBack={() => navigate("home")} showError={showError} />}
          {screen === "profile"      && <ProfileScreen userId={selectedUser ? selectedUser.id : token} currentUser={currentUser} token={token} isOwnProfile={!selectedUser || selectedUser.id === token} onBack={() => navigate("home")} onLogout={onLogout} navigate={navigate} showError={showError} />}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex lg:hidden items-center justify-around px-2 py-1.5 z-20">
        <MobNavBtn icon={<Home size={22} />} label="Feed" active={screen === "home"} onClick={() => navigate("home")} />
        <MobNavBtn icon={<Bell size={22} />} label="Alerts" active={screen === "notifications"} badge={unreadCount} onClick={() => navigate("notifications")} />
        <button onClick={() => navigate("newPost")} className="flex flex-col items-center gap-0.5 -mt-5">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/40">
            <Plus size={24} className="text-white" />
          </div>
          <span className="text-[10px] font-medium text-gray-500 mt-0.5">Post</span>
        </button>
        <MobNavBtn icon={<User size={22} />} label="Profile" active={screen === "profile"} onClick={() => navigate("profile", null, null)} />
      </nav>
    </>
  );
}

function SidebarBtn({ icon, label, active, badge, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition w-full ${active ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"}`}>
      <span className={active ? "text-indigo-600" : "text-gray-500"}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge > 0 && <span className="min-w-[20px] h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{badge}</span>}
    </button>
  );
}

function MobNavBtn({ icon, label, active, badge, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 px-4 py-1 relative">
      <span className={active ? "text-indigo-600" : "text-gray-400"}>{icon}</span>
      <span className={`text-[10px] font-medium ${active ? "text-indigo-600" : "text-gray-400"}`}>{label}</span>
      {badge > 0 && <span className="absolute top-0.5 right-2 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{badge}</span>}
    </button>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────────────

function AuthScreen({ onLogin, showError }) {
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [errs, setErrs] = useState({});
  const [zipStatus, setZipStatus] = useState(null); // null | "checking" | "valid" | "invalid"
  const [form, setForm] = useState({
    name: "", email: "", display_name: "", password: "",
    phone: "", id_verified: false,
    location: { city: "", state: "", zip: "" },
    kids: [],
  });
  const [kidAge, setKidAge] = useState("");

  const set = (f, v) => { setForm(p => ({ ...p, [f]: v })); setErrs(e => ({ ...e, [f]: "" })); };
  const setLoc = (f, v) => { setForm(p => ({ ...p, location: { ...p.location, [f]: v } })); setErrs(e => ({ ...e, [f]: "" })); };

  // Real-time ZIP validation + auto-fill city/state
  useEffect(() => {
    const zip = form.location.zip;
    if (zip.length !== 5) { setZipStatus(null); return; }
    setZipStatus("checking");
    fetch(`https://api.zippopotam.us/us/${zip}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        const place = data.places[0];
        setForm(p => ({ ...p, location: { ...p.location, city: place["place name"], state: place["state"] } }));
        setZipStatus("valid");
        setErrs(e => ({ ...e, zip: "", city: "", state: "" }));
      })
      .catch(() => {
        setZipStatus("invalid");
        setErrs(e => ({ ...e, zip: "Invalid ZIP code. Enter a valid US ZIP." }));
      });
  }, [form.location.zip]);

  const addKid = () => {
    const age = parseInt(kidAge);
    if (!isNaN(age) && age >= 0 && age <= 12) {
      setForm(p => ({ ...p, kids: [...p.kids, { age, id: Date.now() }] }));
      setKidAge("");
      setErrs(e => ({ ...e, kids: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSignup) {
      const validation = validateSignup(form, zipStatus);
      if (Object.keys(validation).length > 0) { setErrs(validation); return; }
    }
    setLoading(true);
    try {
      if (isSignup) {
        const data = await api.post("/auth/register", {
          ...form,
          phone: form.phone.replace(/\D/g, ""),
          profile_picture: "👤",
          kids: form.kids.map(k => ({ age: k.age })),
        });
        onLogin(data.user, data.token);
      } else {
        const data = await api.post("/auth/login", { email: form.email, password: form.password });
        onLogin(data.user, data.token);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => { setIsSignup(!isSignup); setErrs({}); };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-700 flex-col justify-center px-16 text-white">
        <div className="mb-10">
          <div className="text-6xl mb-4">👨‍👩‍👧‍👦</div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">ParentsHub</h1>
          <p className="text-indigo-200 text-lg leading-relaxed">Your neighborhood parent network — ask, offer, and connect.</p>
        </div>
        <div className="space-y-5">
          {[
            ["🏘️", "Hyper-local", "Every parent can connect to a village nearby"],
            ["🚨", "Emergency help", "Get urgent help from nearby families fast"],
            ["🏆", "Kudos system", "Recognize and reward helpful neighbors"],
          ].map(([icon, title, desc]) => (
            <div key={title} className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">{icon}</span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-indigo-300 text-sm">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="text-5xl mb-2">👨‍👩‍👧‍👦</div>
            <h1 className="text-3xl font-extrabold text-indigo-700">ParentsHub</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isSignup ? "Create your account" : "Welcome back"}
            </h2>
            <p className="text-gray-500 text-sm mb-7">
              {isSignup ? "Join your local parent community." : "Sign in to continue."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <>
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Full Name *</label>
                      <input className={`input ${errs.name ? "input-err" : ""}`}
                        placeholder="Jane Doe" value={form.name}
                        onChange={e => set("name", e.target.value)} />
                      <FieldError msg={errs.name} />
                    </div>
                    <div>
                      <label className="label">Display Name *</label>
                      <input className={`input ${errs.display_name ? "input-err" : ""}`}
                        placeholder="JaneMom" value={form.display_name}
                        onChange={e => set("display_name", e.target.value)} />
                      <FieldError msg={errs.display_name} />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="label">Phone Number *</label>
                    <input className={`input ${errs.phone ? "input-err" : ""}`}
                      placeholder="(555) 000-0000" value={form.phone}
                      onChange={e => { set("phone", fmtPhone(e.target.value)); }}
                      inputMode="tel" />
                    <FieldError msg={errs.phone} />
                  </div>

                  {/* Location */}
                  <div>
                    <label className="label">Location *</label>
                    {/* ZIP first — auto-fills city & state */}
                    <div className="relative mb-2">
                      <input className={`input pr-8 ${errs.zip ? "input-err" : zipStatus === "valid" ? "border-emerald-400 focus:ring-emerald-400" : ""}`}
                        placeholder="ZIP Code *" value={form.location.zip}
                        onChange={e => { setLoc("zip", e.target.value.replace(/\D/g, "").slice(0, 5)); }}
                        inputMode="numeric" maxLength={5} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                        {zipStatus === "checking" && <span className="text-gray-400 animate-spin inline-block">⟳</span>}
                        {zipStatus === "valid"    && <CheckCircle size={16} className="text-emerald-500" />}
                        {zipStatus === "invalid"  && <AlertCircle size={16} className="text-red-500" />}
                      </span>
                      <FieldError msg={errs.zip} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          className={`input ${errs.city ? "input-err" : ""} ${zipStatus === "valid" ? "bg-emerald-50 text-gray-700 cursor-not-allowed" : ""}`}
                          placeholder="City *"
                          value={form.location.city}
                          onChange={e => zipStatus !== "valid" && setLoc("city", e.target.value)}
                          readOnly={zipStatus === "valid"}
                        />
                        <FieldError msg={errs.city} />
                      </div>
                      <div>
                        <select
                          className={`input ${errs.state ? "input-err" : ""} ${zipStatus === "valid" ? "bg-emerald-50 text-gray-700 cursor-not-allowed" : ""}`}
                          value={form.location.state}
                          onChange={e => zipStatus !== "valid" && setLoc("state", e.target.value)}
                          disabled={zipStatus === "valid"}
                        >
                          <option value="">Select State *</option>
                          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <FieldError msg={errs.state} />
                      </div>
                    </div>
                    {zipStatus === "valid" && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                        <CheckCircle size={11} /> City and state are locked to your ZIP code — change ZIP to update.
                      </p>
                    )}
                  </div>

                  {/* Kids */}
                  <div>
                    <label className="label">Children's Ages (0–12) *</label>
                    <div className={`border rounded-lg p-3 bg-gray-50 ${errs.kids ? "border-red-400" : "border-gray-200"}`}>
                      <div className="flex gap-2 mb-2">
                        <input type="number" min="0" max="12" inputMode="numeric"
                          className="input flex-1 !bg-white"
                          placeholder="Age (0–12)"
                          value={kidAge}
                          onChange={e => setKidAge(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKid())} />
                        <button type="button" onClick={addKid}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition">
                          Add
                        </button>
                      </div>
                      {form.kids.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {form.kids.map(k => (
                            <span key={k.id} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                              {k.age} yrs
                              <button type="button" onClick={() => setForm(p => ({ ...p, kids: p.kids.filter(x => x.id !== k.id) }))}>
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <FieldError msg={errs.kids} />
                  </div>

                  {/* ID verification */}
                  <div>
                    <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${errs.id_verified ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}>
                      <input type="checkbox" checked={form.id_verified}
                        onChange={e => { set("id_verified", e.target.checked); }}
                        className="w-4 h-4 mt-0.5 accent-indigo-600" />
                      <span className="text-sm text-gray-700">
                        I confirm I have a valid government-issued ID *
                      </span>
                    </label>
                    <FieldError msg={errs.id_verified} />
                  </div>
                </>
              )}

              {/* Email */}
              <div>
                <label className="label">Email Address *</label>
                <input className={`input ${errs.email ? "input-err" : ""}`}
                  type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => set("email", e.target.value)} />
                <FieldError msg={errs.email} />
              </div>

              {/* Password */}
              <div>
                <label className="label">Password *</label>
                <div className="relative">
                  <input className={`input pr-10 ${errs.password ? "input-err" : ""}`}
                    type={showPwd ? "text" : "password"}
                    placeholder={isSignup ? "Minimum 8 characters" : "Your password"}
                    value={form.password} onChange={e => set("password", e.target.value)} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <FieldError msg={errs.password} />
              </div>

              <button type="submit" disabled={loading}
                className="btn-primary w-full py-3 mt-1">
                {loading ? "Please wait…" : isSignup ? "Create Account" : "Sign In"}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-gray-100 pt-5">
              <p className="text-sm text-gray-500">
                {isSignup ? "Already have an account? " : "Don't have an account? "}
                <button onClick={switchMode} className="text-indigo-600 font-semibold hover:underline">
                  {isSignup ? "Sign In" : "Sign Up"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

function HomeScreen({ currentUser, token, navigate, showError }) {
  const [posts, setPosts] = useState([]);
  const [radius, setRadius] = useState(5);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      const data = await api.get(`/posts?user_id=${token}&radius=${radius}`);
      setPosts(data);
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchPosts(); }, [radius]);
  useEffect(() => { const id = setInterval(fetchPosts, 15000); return () => clearInterval(id); }, [radius]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nearby Requests</h1>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
            <MapPin size={13} />{currentUser.location?.city}, {currentUser.location?.state}
          </p>
        </div>
        {/* Radius dropdown */}
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-gray-400 shrink-0" />
          <select value={radius} onChange={e => setRadius(Number(e.target.value))}
            className="input !py-1.5 !px-2.5 !w-auto text-xs font-semibold cursor-pointer">
            {Array.from({ length: 10 }, (_, i) => (i + 1) * 5).map(r => (
              <option key={r} value={r}>{r} miles</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : posts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center text-4xl">👋</div>
          <p className="font-bold text-gray-700 text-lg">No posts nearby yet</p>
          <p className="text-sm text-gray-400">Be the first to post a request in your area!</p>
          <button onClick={() => navigate("newPost")}
            className="btn-primary px-5 py-2.5 mt-2">
            <Plus size={16} /> Create Request
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostCard key={post.id} post={post} onClick={() => navigate("postDetail", post)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post, onClick }) {
  const cfg = PRIORITY[post.priority] || PRIORITY["General"];
  const hoursLeft = Math.max(0, Math.floor((post.expires_at - Date.now()) / 3600000));

  return (
    <div onClick={onClick}
      className={`card cursor-pointer hover:shadow-md transition-shadow overflow-hidden ${cfg.border}`}>
      <div className="p-4">
        {/* Author row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Avatar emoji={post.author.profile_picture} size="sm" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{post.author.display_name}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <MapPin size={10} />{post.author.location.city}, {post.author.location.state}
                <span className="mx-0.5">·</span>
                <Clock size={10} />{timeAgo(post.created_at)}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${cfg.badge}`}>
            {cfg.icon}{post.priority}
          </span>
        </div>

        <p className="text-gray-700 text-sm leading-relaxed">{post.content}</p>

        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {post.tags.map((t, i) => (
              <span key={i} className="px-2.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">#{t}</span>
            ))}
          </div>
        )}

        {post.age_range && (
          <p className="text-xs text-gray-400 mt-2">👶 Ages {post.age_range[0]}–{post.age_range[1]}</p>
        )}

        {post.completed && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
            <CheckCircle size={14} className="text-emerald-500 shrink-0" />
            <span className="text-xs text-emerald-700 font-semibold">Resolved · Kudos to @{post.kudos?.display_name}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-50 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <MessageSquare size={13} />{post.comments?.length || 0} comments
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <Share2 size={13} />{post.shares || 0} shares
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <Clock size={11} />{hoursLeft}h left
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        </div>
      </div>
    </div>
  );
}

// ── New Post Screen ───────────────────────────────────────────────────────────

function NewPostScreen({ token, onBack, onPosted, showError }) {
  const [form, setForm] = useState({ content: "", priority: "General", radius: 5, tags: [], age_range: null });
  const [tagInput, setTagInput] = useState("");
  const [useAge, setUseAge] = useState(false);
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(12);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) { setForm(f => ({ ...f, tags: [...f.tags, t] })); setTagInput(""); }
  };

  const handlePost = async () => {
    if (!form.content.trim()) { showError("Please describe what you need."); return; }
    setLoading(true);
    try {
      await api.post(`/posts?user_id=${token}`, { ...form, age_range: useAge ? [ageMin, ageMax] : null });
      onPosted();
    } catch (err) { showError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-gray-200 flex items-center justify-center transition">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">New Request</h2>
        </div>
        <button onClick={handlePost} disabled={loading}
          className="btn-primary px-5 py-2.5 text-sm">
          {loading ? "Posting…" : "Post Request"}
        </button>
      </div>

      <div className="space-y-4">
        {/* Content */}
        <div className="card p-5">
          <label className="label">What do you need? *</label>
          <textarea className="input resize-none min-h-[120px]" rows={5}
            placeholder="e.g. Need children's Tylenol urgently. My daughter has a fever of 103°F and we've run out…"
            value={form.content} onChange={e => set("content", e.target.value)} />
        </div>

        {/* Priority */}
        <div className="card p-5">
          <label className="label mb-3">Priority Level</label>
          <div className="space-y-2">
            {Object.entries(PRIORITY).map(([p, cfg]) => (
              <button key={p} type="button" onClick={() => set("priority", p)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${form.priority === p ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-lg shrink-0`}>
                  {cfg.emoji}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{p}</p>
                  <p className="text-xs text-gray-400">{cfg.desc}</p>
                </div>
                {form.priority === p && <CheckCircle size={18} className="text-indigo-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Radius */}
        <div className="card p-5">
          <label className="label">Search Radius</label>
          <select value={form.radius} onChange={e => set("radius", Number(e.target.value))}
            className="input cursor-pointer">
            {Array.from({ length: 10 }, (_, i) => (i + 1) * 5).map(r => (
              <option key={r} value={r}>{r} miles</option>
            ))}
          </select>
        </div>

        {/* Age filter */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Filter by child's age</p>
              <p className="text-xs text-gray-400">Optional — target specific age groups</p>
            </div>
            <button type="button" onClick={() => setUseAge(!useAge)}
              className={`w-11 h-6 rounded-full transition-colors relative ${useAge ? "bg-indigo-600" : "bg-gray-300"}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useAge ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {useAge && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="label">Min Age</label>
                <input type="number" min="0" max="12" className="input" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Max Age</label>
                <input type="number" min="0" max="12" className="input" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="card p-5">
          <label className="label">Tags <span className="font-normal text-gray-400">(optional)</span></label>
          <div className="flex gap-2 mb-3">
            <input className="input flex-1" placeholder="e.g. medicine, babysitting, toys"
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} />
            <button type="button" onClick={addTag}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition">
              Add
            </button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.tags.map((t, i) => (
                <span key={i} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                  #{t}
                  <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
          <MapPin size={16} className="shrink-0 text-indigo-500" />
          Visible to parents within <strong>{form.radius} miles</strong> for 24 hours
          {useAge && <> · Ages {ageMin}–{ageMax}</>}
        </div>
      </div>
    </div>
  );
}

// ── Post Detail ───────────────────────────────────────────────────────────────

function PostDetailScreen({ postId, token, currentUser, onBack, onMessageUser, showError }) {
  const [post, setPost] = useState(null);
  const [comment, setComment] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [kudosUserId, setKudosUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = async () => {
    try { const d = await api.get(`/posts/${postId}`); setPost(d); }
    catch (err) { showError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPost(); }, [postId]);

  const handleComment = async () => {
    if (!comment.trim()) return;
    try { await api.post(`/posts/${postId}/comments`, { author_id: token, content: comment }); setComment(""); fetchPost(); }
    catch (err) { showError(err.message); }
  };

  const handleShare = async () => {
    try { await api.post(`/posts/${postId}/share?user_id=${token}`, {}); fetchPost(); }
    catch (err) { showError(err.message); }
  };

  const handleComplete = async () => {
    if (!kudosUserId) { showError("Please select who helped you."); return; }
    try { await api.post(`/posts/${postId}/complete?user_id=${token}`, { kudos_user_id: kudosUserId }); setShowComplete(false); fetchPost(); }
    catch (err) { showError(err.message); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;
  if (!post) return null;

  const isAuthor = post.author.id === token;
  const cfg = PRIORITY[post.priority] || PRIORITY["General"];
  const commenters = [...new Map(post.comments.map(c => [c.author.id, c.author])).values()].filter(u => u.id !== token);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-gray-200 flex items-center justify-center transition">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Request Details</h2>
        <button onClick={handleShare} className="ml-auto flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
          <Share2 size={15} /> Share
        </button>
      </div>

      <div className="space-y-4">
        {/* Post */}
        <div className={`card overflow-hidden ${cfg.border}`}>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Avatar emoji={post.author.profile_picture} size="md" />
                <div>
                  <p className="font-semibold text-gray-900">{post.author.display_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{post.author.location.city}, {post.author.location.state} · {timeAgo(post.created_at)}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${cfg.badge}`}>
                {cfg.icon}{post.priority}
              </span>
            </div>
            <p className="text-gray-700 leading-relaxed">{post.content}</p>
            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {post.tags.map((t, i) => <span key={i} className="px-2.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">#{t}</span>)}
              </div>
            )}
            {post.completed && (
              <div className="flex items-center gap-2 mt-4 px-3 py-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                <span className="text-sm text-emerald-700 font-semibold">Resolved · Kudos given to @{post.kudos?.display_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {isAuthor && !post.completed && (
          <button onClick={() => setShowComplete(true)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition">
            <CheckCircle size={18} /> Mark Resolved & Give Kudos
          </button>
        )}
        {!isAuthor && (
          <button onClick={() => onMessageUser(post.author)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition">
            <MessageSquare size={18} /> Message {post.author.display_name}
          </button>
        )}

        {/* Comments */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Comments</h3>
            <span className="text-sm font-semibold text-gray-400">{post.comments.length}</span>
          </div>
          {post.comments.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-sm text-gray-400">No comments yet. Be the first to help!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {post.comments.map(c => (
                <div key={c.id} className="p-4 flex gap-3">
                  <Avatar emoji={c.author.profile_picture} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-900">{c.author.display_name}</span>
                      <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
                    {!isAuthor && c.author.id !== token && (
                      <button onClick={() => onMessageUser(c.author)} className="text-xs text-indigo-600 font-semibold mt-1.5 hover:underline">
                        Message privately
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!post.completed && (
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <input className="input flex-1" value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Write a comment…" onKeyDown={e => e.key === "Enter" && handleComment()} />
              <button onClick={handleComment}
                className="w-11 h-11 bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center justify-center transition shrink-0">
                <Send size={16} className="text-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kudos modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-5xl mb-2">🏆</div>
              <h3 className="text-xl font-extrabold text-gray-900">Give Kudos</h3>
              <p className="text-sm text-gray-500 mt-1">Who helped you? They'll receive kudos on their profile.</p>
            </div>
            {commenters.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No commenters yet to give kudos to.</p>
            ) : commenters.map(u => (
              <button key={u.id} onClick={() => setKudosUserId(u.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-2 transition ${kudosUserId === u.id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <Avatar emoji={u.profile_picture} size="xs" />
                <div className="text-left flex-1">
                  <p className="font-semibold text-sm text-gray-900">{u.display_name}</p>
                  <p className="text-xs text-gray-400">{u.location?.city}, {u.location?.state}</p>
                </div>
                {kudosUserId === u.id && <CheckCircle size={18} className="text-indigo-600" />}
              </button>
            ))}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowComplete(false)} className="btn-outline flex-1 py-2.5">Cancel</button>
              <button onClick={handleComplete} disabled={!kudosUserId} className="btn-primary flex-1 py-2.5">Confirm ✨</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

function NotificationsScreen({ token, onBack, onViewPost, navigate, showError }) {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    api.get(`/notifications/${token}`).then(setNotifs).catch(err => showError(err.message));
  }, []);

  const handleClick = async (n) => {
    await api.patch(`/notifications/${n.id}/read`);
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    if (n.post_id) onViewPost({ id: n.post_id });
  };

  const TYPE = {
    new_post: { icon: <Bell size={16} />,          bg: "bg-indigo-600" },
    comment:  { icon: <MessageSquare size={16} />,  bg: "bg-sky-500" },
    share:    { icon: <Share2 size={16} />,          bg: "bg-emerald-500" },
    kudos:    { icon: <Award size={16} />,           bg: "bg-amber-500" },
    message:  { icon: <Send size={16} />,            bg: "bg-pink-500" },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-gray-200 flex items-center justify-center transition lg:hidden">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
        {notifs.filter(n => !n.read).length > 0 && (
          <span className="px-2.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">
            {notifs.filter(n => !n.read).length} new
          </span>
        )}
      </div>

      {notifs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center text-4xl">🔔</div>
          <p className="font-bold text-gray-700">All caught up!</p>
          <p className="text-sm text-gray-400">No new notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const t = TYPE[n.type] || TYPE.new_post;
            return (
              <div key={n.id} onClick={() => handleClick(n)}
                className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all border ${n.read ? "bg-white border-gray-200" : "bg-indigo-50 border-indigo-200"}`}>
                <div className={`w-10 h-10 ${t.bg} rounded-full flex items-center justify-center text-white shrink-0 shadow-sm`}>
                  {t.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${n.read ? "text-gray-600" : "text-gray-900 font-semibold"}`}>{n.content}</p>
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full shrink-0 mt-1.5" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function ChatScreen({ currentUser, token, otherUser, onBack, showError }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const fetchMsgs = async () => {
    try { const d = await api.get(`/messages/${token}/${otherUser.id}`); setMsgs(d); }
    catch (err) { showError(err.message); }
  };

  useEffect(() => { fetchMsgs(); }, []);
  useEffect(() => { const id = setInterval(fetchMsgs, 5000); return () => clearInterval(id); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const handleSend = async () => {
    if (!text.trim()) return;
    try { await api.post("/messages", { from_id: token, to_id: otherUser.id, content: text }); setText(""); fetchMsgs(); }
    catch (err) { showError(err.message); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0 shadow-sm">
        <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <Avatar emoji={otherUser.profile_picture} size="sm" />
        <div>
          <p className="font-semibold text-gray-900">{otherUser.display_name}</p>
          <p className="text-xs text-gray-400">{otherUser.location?.city}, {otherUser.location?.state}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-100">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Avatar emoji={otherUser.profile_picture} size="lg" />
            <p className="font-semibold text-gray-600">{otherUser.display_name}</p>
            <p className="text-sm text-gray-400">Say hello! 👋</p>
          </div>
        )}
        {msgs.map(m => {
          const isOwn = m.from_id === token;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
              {!isOwn && <Avatar emoji={otherUser.profile_picture} size="xs" />}
              <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm ${isOwn ? "bg-indigo-600 text-white rounded-br-md" : "bg-white text-gray-800 rounded-bl-md shadow-sm"}`}>
                <p className="leading-relaxed">{m.content}</p>
                <p className={`text-[10px] mt-1 ${isOwn ? "text-indigo-200" : "text-gray-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex gap-2 shrink-0">
        <input className="input flex-1 !rounded-full" value={text}
          onChange={e => setText(e.target.value)} placeholder="Message…"
          onKeyDown={e => e.key === "Enter" && handleSend()} />
        <button onClick={handleSend} disabled={!text.trim()}
          className="w-11 h-11 bg-indigo-600 hover:bg-indigo-700 rounded-full flex items-center justify-center transition disabled:opacity-40 shrink-0">
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileScreen({ userId, currentUser, token, isOwnProfile, onBack, onLogout, navigate, showError }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    Promise.all([api.get(`/users/${userId}`), api.get(`/posts?user_id=${userId}&radius=9999`)])
      .then(([u, p]) => { setUser(u); setPosts(p.filter(post => post.author.id === userId)); })
      .catch(err => showError(err.message));
  }, [userId]);

  if (!user) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>;

  const completedPosts = posts.filter(p => p.completed);
  const kudosPosts = completedPosts.filter(p => p.kudos?.id === userId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-gray-200 flex items-center justify-center transition lg:hidden">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Profile</h1>
        {isOwnProfile && (
          <button onClick={onLogout}
            className="ml-auto flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition">
            <LogOut size={15} /> Log Out
          </button>
        )}
      </div>

      {/* Profile card */}
      <div className="card overflow-hidden mb-4">
        <div className="h-24 bg-gradient-to-r from-indigo-600 to-purple-600" />
        <div className="px-5 pb-5">
          <div className="flex items-end justify-between -mt-10 mb-4">
            <div className="w-20 h-20 rounded-full bg-white border-4 border-white shadow-lg flex items-center justify-center text-4xl">
              {user.profile_picture}
            </div>
            <div className="flex items-center gap-1.5 pb-1">
              <Star size={16} fill="#f59e0b" color="#f59e0b" />
              <span className="font-bold text-gray-800">{user.trust_score.toFixed(1)}</span>
              <span className="text-xs text-gray-400">trust</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{user.display_name}</h2>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
            <MapPin size={13} />{user.location.city}, {user.location.state}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
          {[
            ["Posts", posts.length, "text-indigo-600"],
            ["Resolved", completedPosts.length, "text-emerald-600"],
            ["Kudos", user.kudos_count, "text-amber-500"],
          ].map(([label, val, color]) => (
            <div key={label} className="flex flex-col items-center py-4">
              <span className={`text-2xl font-extrabold ${color}`}>{val}</span>
              <span className="text-xs text-gray-400 mt-0.5">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Kids */}
      <div className="card p-5 mb-4">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="text-xl">👶</span> Children
        </h3>
        <div className="flex flex-wrap gap-2">
          {user.kids.length === 0
            ? <p className="text-sm text-gray-400">No children added</p>
            : user.kids.map((kid, i) => (
              <span key={i} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full font-semibold text-sm">
                {kid.age} yrs
              </span>
            ))
          }
        </div>
      </div>

      {/* Kudos received */}
      <div className="card p-5 mb-4">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Award size={18} className="text-amber-500" /> Kudos Received
        </h3>
        {kudosPosts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-2">🏆</p>
            <p className="text-sm text-gray-400">No kudos yet — start helping neighbors!</p>
          </div>
        ) : kudosPosts.map(p => (
          <div key={p.id} className="p-3 bg-amber-50 border border-amber-100 rounded-xl mb-2">
            <p className="text-sm text-gray-700 mb-1 leading-snug">{p.content.substring(0, 80)}…</p>
            <p className="text-xs text-amber-600 font-bold">From @{p.author.display_name}</p>
          </div>
        ))}
      </div>

      {/* Recent posts */}
      {posts.length > 0 && (
        <div className="card p-5">
          <h3 className="font-bold text-gray-900 mb-3">Recent Posts</h3>
          <div className="space-y-2">
            {posts.slice(0, 4).map(p => {
              const cfg = PRIORITY[p.priority] || PRIORITY["General"];
              return (
                <div key={p.id} className={`p-3 rounded-xl bg-gray-50 border border-gray-100 ${cfg.border}`}>
                  <p className="text-sm text-gray-700 leading-snug line-clamp-2">{p.content}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{p.priority}</span>
                    <span className="text-xs text-gray-400">{timeAgo(p.created_at)}</span>
                    {p.completed && <span className="text-xs text-emerald-600 font-bold">✓ Resolved</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
