import { useState, useEffect, useRef } from "react";
import {
  Bell, MessageSquare, MapPin, Award, Star,
  Send, Share2, CheckCircle, AlertCircle, Info, X, Plus,
  ChevronLeft, Home, User, Sparkles, Clock,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = {
  async post(path, body, params = "") {
    const res = await fetch(`${API}${path}${params}`, {
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ emoji = "👤", gradient = "from-violet-500 to-pink-500", size = "md" }) {
  const dim = { sm: "w-9 h-9 text-base", md: "w-11 h-11 text-xl", lg: "w-20 h-20 text-4xl" }[size];
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${gradient} p-[2.5px] flex-shrink-0`}>
      <div className="w-full h-full rounded-full bg-white flex items-center justify-center leading-none">
        {emoji}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin" />
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );
}

const PRIORITY = {
  "Emergency Medical": {
    badge: "bg-red-50 text-red-500 border border-red-100",
    leftBar: "border-l-[4px] border-l-red-400",
    icon: <AlertCircle size={11} />,
    headerGrad: "from-red-500 to-rose-400",
    dot: "bg-red-400",
    emoji: "🚨",
    desc: "Urgent health needs",
  },
  "Important": {
    badge: "bg-amber-50 text-amber-500 border border-amber-100",
    leftBar: "border-l-[4px] border-l-amber-400",
    icon: <Info size={11} />,
    headerGrad: "from-amber-500 to-orange-400",
    dot: "bg-amber-400",
    emoji: "⚡",
    desc: "Time-sensitive request",
  },
  "General": {
    badge: "bg-sky-50 text-sky-500 border border-sky-100",
    leftBar: "",
    icon: <MessageSquare size={11} />,
    headerGrad: "from-sky-500 to-blue-400",
    dot: "bg-sky-400",
    emoji: "💬",
    desc: "Questions & offers",
  },
};

// ─── ROOT ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [screen, setScreen] = useState("auth");
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

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
    <div className="min-h-screen bg-slate-50 max-w-[430px] mx-auto relative select-none overflow-x-hidden">

      {/* Toast error */}
      {error && (
        <div className="fixed top-4 left-4 right-4 z-[60] max-w-[400px] mx-auto">
          <div className="bg-white border border-red-100 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <span className="text-sm text-slate-700 flex-1">{error}</span>
            <button onClick={() => setError("")}><X size={16} className="text-slate-400" /></button>
          </div>
        </div>
      )}

      {screen === "auth"        && <AuthScreen onLogin={handleLogin} setError={setError} />}
      {screen === "home"        && currentUser && <HomeScreen currentUser={currentUser} token={token} navigate={navigate} unreadCount={unreadCount} setError={setError} />}
      {screen === "newPost"     && currentUser && <NewPostScreen token={token} onBack={() => setScreen("home")} onPosted={() => setScreen("home")} setError={setError} />}
      {screen === "postDetail"  && selectedPost && <PostDetailScreen postId={selectedPost.id} token={token} currentUser={currentUser} onBack={() => navigate("home")} onMessageUser={u => navigate("chat", null, u)} setError={setError} />}
      {screen === "notifications" && <NotificationsScreen token={token} onBack={() => setScreen("home")} onViewPost={p => navigate("postDetail", p)} navigate={navigate} setError={setError} />}
      {screen === "chat"        && selectedUser && <ChatScreen currentUser={currentUser} token={token} otherUser={selectedUser} onBack={() => setScreen("home")} setError={setError} />}
      {screen === "profile"     && <ProfileScreen userId={selectedUser ? selectedUser.id : token} currentUser={currentUser} token={token} isOwnProfile={!selectedUser || selectedUser.id === token} onBack={() => setScreen("home")} onLogout={handleLogout} navigate={navigate} setError={setError} />}
    </div>
  );
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────

function AuthScreen({ onLogin, setError }) {
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", display_name: "", password: "",
    phone: "", id_verified: false,
    location: { city: "", state: "", zip: "" },
    kids: [],
  });
  const [kidAge, setKidAge] = useState("");

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const setLoc = (f, v) => setForm(p => ({ ...p, location: { ...p.location, [f]: v } }));

  const addKid = () => {
    const age = parseInt(kidAge);
    if (age >= 0 && age <= 12) {
      setForm(p => ({ ...p, kids: [...p.kids, { age, id: Date.now() }] }));
      setKidAge("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        if (form.kids.length === 0) throw new Error("Please add at least one child.");
        if (!form.id_verified) throw new Error("Please verify your ID.");
        const data = await api.post("/auth/register", {
          ...form,
          profile_picture: "👤",
          kids: form.kids.map(k => ({ age: k.age })),
        });
        onLogin(data.user, data.token);
      } else {
        const data = await api.post("/auth/login", { email: form.email, password: form.password });
        onLogin(data.user, data.token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-pink-400/20 blur-3xl pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-7xl mb-3 drop-shadow-xl">👨‍👩‍👧‍👦</div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow">ParentsHub</h1>
          <p className="text-white/70 text-sm mt-1">Your village, always nearby</p>
        </div>

        {/* Card */}
        <div className="w-full bg-white rounded-3xl shadow-2xl shadow-violet-900/20 p-6 overflow-y-auto max-h-[68vh]">
          <h2 className="text-xl font-bold text-slate-800 mb-5">
            {isSignup ? "Create your account" : "Welcome back 👋"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignup && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Full Name *" value={form.name} onChange={e => set("name", e.target.value)} required />
                  <input className="input" placeholder="Display Name *" value={form.display_name} onChange={e => set("display_name", e.target.value)} required />
                </div>
                <input className="input" placeholder="Phone Number *" value={form.phone} onChange={e => set("phone", e.target.value)} required />
                <div className="grid grid-cols-3 gap-2">
                  <input className="input" placeholder="City *" value={form.location.city} onChange={e => setLoc("city", e.target.value)} required />
                  <input className="input" placeholder="State *" value={form.location.state} onChange={e => setLoc("state", e.target.value)} required />
                  <input className="input" placeholder="ZIP *" value={form.location.zip} onChange={e => setLoc("zip", e.target.value)} required />
                </div>

                {/* Kids */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Kids Ages (0–12) *</p>
                  <div className="flex gap-2 mb-2">
                    <input type="number" min="0" max="12" className="input flex-1" placeholder="Age"
                      value={kidAge} onChange={e => setKidAge(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKid())} />
                    <button type="button" onClick={addKid}
                      className="px-4 py-2 bg-gradient-to-r from-violet-600 to-pink-500 text-white rounded-xl text-sm font-bold shadow-md shadow-violet-500/20">
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.kids.map(k => (
                      <span key={k.id} className="flex items-center gap-1.5 px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-sm font-medium">
                        {k.age} yrs
                        <button type="button" onClick={() => setForm(p => ({ ...p, kids: p.kids.filter(x => x.id !== k.id) }))}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* ID verification */}
                <label className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={form.id_verified} onChange={e => set("id_verified", e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-violet-600" />
                  <span className="text-sm text-slate-600">I confirm I have a valid government-issued ID *</span>
                </label>
              </>
            )}

            <input className="input" type="email" placeholder="Email address *" value={form.email} onChange={e => set("email", e.target.value)} required />
            <input className="input" type="password" placeholder="Password *" value={form.password} onChange={e => set("password", e.target.value)} required />

            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-pink-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/30 hover:opacity-90 transition active:scale-[0.98] mt-1">
              {loading ? "Please wait…" : isSignup ? "Create Account" : "Login"}
            </button>
          </form>

          <div className="text-center mt-5">
            <button onClick={() => setIsSignup(!isSignup)} className="text-sm text-violet-600 font-semibold hover:underline">
              {isSignup ? "Already have an account? Login" : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HOME ──────────────────────────────────────────────────────────────────────

function HomeScreen({ currentUser, token, navigate, unreadCount, setError }) {
  const [posts, setPosts] = useState([]);
  const [radius, setRadius] = useState(50);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      const data = await api.get(`/posts?user_id=${token}&radius=${radius}`);
      setPosts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [radius]);
  useEffect(() => { const id = setInterval(fetchPosts, 15000); return () => clearInterval(id); }, [radius]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 sticky top-0 z-20 shadow-lg shadow-violet-500/20">
        <div className="px-4 pt-12 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">ParentsHub</h1>
            <p className="text-white/60 text-xs flex items-center gap-1 mt-0.5">
              <MapPin size={10} />{currentUser.location.city}, {currentUser.location.state}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("notifications")}
              className="relative w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
              <Bell size={19} className="text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => navigate("profile")}
              className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-xl">
              {currentUser.profile_picture}
            </button>
          </div>
        </div>

        {/* Radius chips */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          {[10, 20, 30, 50].map(r => (
            <button key={r} onClick={() => setRadius(r)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                radius === r
                  ? "bg-white text-violet-700 shadow-md"
                  : "bg-white/20 text-white/90"
              }`}>
              {r} mi
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="p-4 space-y-4">
        {loading ? (
          <Spinner />
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center text-5xl">
              👋
            </div>
            <p className="font-bold text-slate-700 text-lg">No posts nearby</p>
            <p className="text-sm text-slate-400">Be the first to post a request!</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard key={post.id} post={post} onClick={() => navigate("postDetail", post)} />
          ))
        )}
      </div>

      {/* FAB */}
      <button onClick={() => navigate("newPost")}
        className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-br from-violet-600 to-pink-500 rounded-full shadow-xl shadow-violet-500/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-10">
        <Plus size={26} className="text-white" />
      </button>

      <BottomNav active="home" navigate={navigate} />
    </div>
  );
}

// ─── POST CARD ─────────────────────────────────────────────────────────────────

function PostCard({ post, onClick }) {
  const cfg = PRIORITY[post.priority] || PRIORITY["General"];
  const hoursLeft = Math.max(0, Math.floor((post.expires_at - Date.now()) / 3600000));

  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer active:scale-[0.99] transition-transform ${cfg.leftBar}`}>

      {/* Author row */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Avatar emoji={post.author.profile_picture} />
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">{post.author.display_name}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin size={9} />{post.author.location.city}, {post.author.location.state}
                <span className="mx-0.5">·</span>
                <Clock size={9} />{timeAgo(post.created_at)}
              </p>
            </div>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
            {cfg.icon}{post.priority}
          </span>
        </div>

        {/* Content */}
        <p className="text-slate-700 text-sm leading-relaxed mt-3">{post.content}</p>

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {post.tags.map((t, i) => (
              <span key={i} className="px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Age range */}
        {post.age_range && (
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            👶 For kids ages {post.age_range[0]}–{post.age_range[1]}
          </p>
        )}

        {/* Completed banner */}
        {post.completed && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
            <CheckCircle size={14} className="text-emerald-500 shrink-0" />
            <span className="text-xs text-emerald-700 font-semibold">
              Resolved · Kudos to @{post.kudos?.display_name}
            </span>
          </div>
        )}
      </div>

      {/* Engagement bar */}
      <div className="px-4 py-2.5 border-t border-slate-50 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <MessageSquare size={13} className="text-slate-300" />{post.comments?.length || 0}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Share2 size={13} className="text-slate-300" />{post.shares || 0}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock size={10} />{hoursLeft}h left
          </span>
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        </div>
      </div>
    </div>
  );
}

// ─── NEW POST ──────────────────────────────────────────────────────────────────

function NewPostScreen({ token, onBack, onPosted, setError }) {
  const [form, setForm] = useState({ content: "", priority: "General", radius: 20, tags: [], age_range: null });
  const [tagInput, setTagInput] = useState("");
  const [useAge, setUseAge] = useState(false);
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(12);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = () => {
    if (tagInput.trim()) {
      setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
      setTagInput("");
    }
  };

  const handlePost = async () => {
    if (!form.content.trim()) { setError("Please describe what you need."); return; }
    setLoading(true);
    try {
      await api.post(`/posts?user_id=${token}`, { ...form, age_range: useAge ? [ageMin, ageMax] : null });
      onPosted();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onBack} className="text-slate-500 font-medium text-sm">Cancel</button>
        <h2 className="font-bold text-slate-800 text-base">New Request</h2>
        <button onClick={handlePost} disabled={loading}
          className="px-5 py-2 bg-gradient-to-r from-violet-600 to-pink-500 text-white text-sm font-bold rounded-xl disabled:opacity-50 shadow-md shadow-violet-500/20">
          {loading ? "Posting…" : "Post"}
        </button>
      </div>

      <div className="p-4 pb-12 space-y-4">
        {/* Content */}
        <div className="card p-4">
          <label className="label">What do you need? *</label>
          <textarea className="input resize-none min-h-[110px]" rows={5}
            placeholder="e.g. Need children's Tylenol urgently. My daughter has a fever of 103°F…"
            value={form.content} onChange={e => set("content", e.target.value)} />
        </div>

        {/* Priority */}
        <div className="card p-4">
          <label className="label">Priority Level</label>
          <div className="space-y-2">
            {[
              ["Emergency Medical", "Urgent health-related needs"],
              ["Important", "Time-sensitive but not emergency"],
              ["General", "Questions, offers & resources"],
            ].map(([p, desc]) => {
              const cfg = PRIORITY[p];
              return (
                <button key={p} type="button" onClick={() => set("priority", p)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${
                    form.priority === p ? "border-violet-400 bg-violet-50" : "border-slate-100 bg-white hover:bg-slate-50"
                  }`}>
                  <div className={`w-9 h-9 flex-shrink-0 rounded-xl bg-gradient-to-br ${cfg.headerGrad} flex items-center justify-center text-base`}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{p}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  {form.priority === p && <CheckCircle size={18} className="text-violet-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Radius */}
        <div className="card p-4">
          <label className="label">Search Radius</label>
          <div className="flex gap-2">
            {[10, 20, 30, 50].map(r => (
              <button key={r} type="button" onClick={() => set("radius", r)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition ${
                  form.radius === r
                    ? "bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-md shadow-violet-500/20"
                    : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                }`}>
                {r} mi
              </button>
            ))}
          </div>
        </div>

        {/* Age filter */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Filter by kid's age <span className="font-normal text-slate-400">(optional)</span></label>
            <button type="button" onClick={() => setUseAge(!useAge)}
              className={`w-11 h-6 rounded-full transition-colors relative ${useAge ? "bg-violet-600" : "bg-slate-200"}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useAge ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {useAge && (
            <div className="flex gap-3 mt-3">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">Min Age</label>
                <input type="number" min="0" max="12" className="input" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">Max Age</label>
                <input type="number" min="0" max="12" className="input" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="card p-4">
          <label className="label">Tags <span className="font-normal text-slate-400">(optional)</span></label>
          <div className="flex gap-2 mb-3">
            <input className="input flex-1" placeholder="medicine, toys, babysitting…"
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} />
            <button type="button" onClick={addTag}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold transition">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.tags.map((t, i) => (
              <span key={i} className="flex items-center gap-1.5 px-3 py-1 bg-violet-50 text-violet-600 rounded-full text-sm font-medium">
                #{t}
                <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))}><X size={12} /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 bg-gradient-to-r from-violet-50 to-pink-50 border border-violet-100 rounded-2xl">
          <Sparkles size={16} className="text-violet-500 shrink-0" />
          <span className="text-sm text-violet-700">
            Visible to parents within <strong>{form.radius} miles</strong> for 24 hours
            {useAge && <> · Ages {ageMin}–{ageMax}</>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── POST DETAIL ───────────────────────────────────────────────────────────────

function PostDetailScreen({ postId, token, currentUser, onBack, onMessageUser, setError }) {
  const [post, setPost] = useState(null);
  const [comment, setComment] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [kudosUserId, setKudosUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = async () => {
    try { const d = await api.get(`/posts/${postId}`); setPost(d); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPost(); }, [postId]);

  const handleComment = async () => {
    if (!comment.trim()) return;
    try { await api.post(`/posts/${postId}/comments`, { author_id: token, content: comment }); setComment(""); fetchPost(); }
    catch (err) { setError(err.message); }
  };

  const handleShare = async () => {
    try { await api.post(`/posts/${postId}/share?user_id=${token}`, {}); fetchPost(); }
    catch (err) { setError(err.message); }
  };

  const handleComplete = async () => {
    if (!kudosUserId) { setError("Please select who helped you."); return; }
    try { await api.post(`/posts/${postId}/complete?user_id=${token}`, { kudos_user_id: kudosUserId }); setShowComplete(false); fetchPost(); }
    catch (err) { setError(err.message); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (!post) return null;

  const isAuthor = post.author.id === token;
  const cfg = PRIORITY[post.priority] || PRIORITY["General"];
  const commenters = [...new Map(post.comments.map(c => [c.author.id, c.author])).values()].filter(u => u.id !== token);

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className={`bg-gradient-to-r ${cfg.headerGrad} px-4 pt-12 pb-4 flex items-center gap-3 shadow-lg`}>
        <button onClick={onBack} className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
          <ChevronLeft size={22} className="text-white" />
        </button>
        <h2 className="font-bold text-white flex-1 text-base">Request Details</h2>
        <button onClick={handleShare} className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
          <Share2 size={17} className="text-white" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Post card */}
        <div className={`bg-white rounded-2xl shadow-sm overflow-hidden ${cfg.leftBar}`}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <Avatar emoji={post.author.profile_picture} />
                <div>
                  <p className="font-bold text-slate-800">{post.author.display_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {post.author.location.city}, {post.author.location.state} · {timeAgo(post.created_at)}
                  </p>
                </div>
              </div>
              <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
                {cfg.icon}{post.priority}
              </span>
            </div>
            <p className="text-slate-700 leading-relaxed">{post.content}</p>
            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {post.tags.map((t, i) => <span key={i} className="px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">#{t}</span>)}
              </div>
            )}
            {post.completed && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                <CheckCircle size={14} className="text-emerald-500" />
                <span className="text-xs text-emerald-700 font-semibold">Resolved · Kudos to @{post.kudos?.display_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {isAuthor && !post.completed && (
          <button onClick={() => setShowComplete(true)}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2">
            <CheckCircle size={18} /> Mark Resolved & Give Kudos
          </button>
        )}
        {!isAuthor && (
          <button onClick={() => onMessageUser(post.author)}
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-pink-500 text-white rounded-2xl font-bold shadow-md shadow-violet-500/20 flex items-center justify-center gap-2">
            <MessageSquare size={18} /> Message {post.author.display_name}
          </button>
        )}

        {/* Comments */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Comments</h3>
            <span className="text-sm font-semibold text-slate-400">{post.comments.length}</span>
          </div>

          {post.comments.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-sm text-slate-400">No comments yet. Be the first to help!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {post.comments.map(c => (
                <div key={c.id} className="p-4 flex gap-3">
                  <Avatar emoji={c.author.profile_picture} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-bold text-sm text-slate-800">{c.author.display_name}</span>
                      <span className="text-xs text-slate-400">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{c.content}</p>
                    {!isAuthor && c.author.id !== token && (
                      <button onClick={() => onMessageUser(c.author)} className="text-xs text-violet-500 font-semibold mt-1.5">
                        Message privately
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!post.completed && (
            <div className="p-4 border-t border-slate-50 flex gap-2">
              <input className="input flex-1" value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Write a comment…" onKeyDown={e => e.key === "Enter" && handleComment()} />
              <button onClick={handleComment}
                className="w-11 h-11 bg-gradient-to-r from-violet-600 to-pink-500 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/20 shrink-0">
                <Send size={15} className="text-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kudos modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-5xl mb-2">🏆</div>
              <h3 className="text-xl font-extrabold text-slate-800">Give Kudos</h3>
              <p className="text-sm text-slate-500 mt-1">Who helped you? They'll receive kudos on their profile.</p>
            </div>
            {commenters.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3 mb-3">No commenters to kudos yet.</p>
            ) : commenters.map(u => (
              <button key={u.id} onClick={() => setKudosUserId(u.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-2 transition ${kudosUserId === u.id ? "border-violet-400 bg-violet-50" : "border-slate-100 hover:bg-slate-50"}`}>
                <Avatar emoji={u.profile_picture} size="sm" />
                <div className="text-left flex-1">
                  <p className="font-bold text-sm text-slate-800">{u.display_name}</p>
                  <p className="text-xs text-slate-400">{u.location.city}, {u.location.state}</p>
                </div>
                {kudosUserId === u.id && <CheckCircle size={18} className="text-violet-500" />}
              </button>
            ))}
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowComplete(false)}
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button onClick={handleComplete} disabled={!kudosUserId}
                className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-pink-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 shadow-md shadow-violet-500/20">
                Complete ✨
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────

function NotificationsScreen({ token, onBack, onViewPost, navigate, setError }) {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    api.get(`/notifications/${token}`).then(setNotifs).catch(err => setError(err.message));
  }, []);

  const handleClick = async (n) => {
    await api.patch(`/notifications/${n.id}/read`);
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    if (n.post_id) onViewPost({ id: n.post_id });
  };

  const TYPE = {
    new_post: { icon: <Bell size={16} />,         color: "bg-violet-500" },
    comment:  { icon: <MessageSquare size={16} />, color: "bg-sky-500" },
    share:    { icon: <Share2 size={16} />,        color: "bg-emerald-500" },
    kudos:    { icon: <Award size={16} />,         color: "bg-amber-500" },
    message:  { icon: <Send size={16} />,          color: "bg-pink-500" },
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 px-4 pt-12 pb-4 flex items-center gap-3 shadow-lg shadow-violet-500/20">
        <button onClick={onBack} className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
          <ChevronLeft size={22} className="text-white" />
        </button>
        <h2 className="font-bold text-white text-lg flex-1">Notifications</h2>
        {notifs.filter(n => !n.read).length > 0 && (
          <span className="px-3 py-1 bg-white/20 rounded-full text-white text-xs font-bold">
            {notifs.filter(n => !n.read).length} new
          </span>
        )}
      </div>

      <div className="p-4 space-y-2">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-24 h-24 rounded-full bg-violet-50 flex items-center justify-center text-5xl">🔔</div>
            <p className="font-bold text-slate-700">All caught up!</p>
            <p className="text-sm text-slate-400">No new notifications</p>
          </div>
        ) : notifs.map(n => {
          const t = TYPE[n.type] || TYPE.new_post;
          return (
            <div key={n.id} onClick={() => handleClick(n)}
              className={`flex items-start gap-3 p-4 rounded-2xl cursor-pointer transition-all ${
                n.read ? "bg-white border border-slate-100" : "bg-violet-50 border border-violet-100 shadow-sm"
              }`}>
              <div className={`w-9 h-9 ${t.color} rounded-full flex items-center justify-center text-white shrink-0 shadow-sm`}>
                {t.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${n.read ? "text-slate-600" : "text-slate-900 font-semibold"}`}>
                  {n.content}
                </p>
                <p className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && <div className="w-2.5 h-2.5 bg-violet-500 rounded-full shrink-0 mt-1" />}
            </div>
          );
        })}
      </div>

      <BottomNav active="notifications" navigate={navigate} />
    </div>
  );
}

// ─── CHAT ──────────────────────────────────────────────────────────────────────

function ChatScreen({ currentUser, token, otherUser, onBack, setError }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const fetchMsgs = async () => {
    try { const d = await api.get(`/messages/${token}/${otherUser.id}`); setMsgs(d); }
    catch (err) { setError(err.message); }
  };

  useEffect(() => { fetchMsgs(); }, []);
  useEffect(() => { const id = setInterval(fetchMsgs, 5000); return () => clearInterval(id); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const handleSend = async () => {
    if (!text.trim()) return;
    try { await api.post("/messages", { from_id: token, to_id: otherUser.id, content: text }); setText(""); fetchMsgs(); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 px-4 pt-12 pb-4 flex items-center gap-3 shrink-0 shadow-lg shadow-violet-500/20">
        <button onClick={onBack} className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
          <ChevronLeft size={22} className="text-white" />
        </button>
        <div className="w-9 h-9 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-xl shrink-0">
          {otherUser.profile_picture}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white leading-tight truncate">{otherUser.display_name}</p>
          <p className="text-xs text-white/60">{otherUser.location?.city}, {otherUser.location?.state}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 pb-10">
            <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center text-3xl">
              {otherUser.profile_picture}
            </div>
            <p className="font-semibold text-slate-600">{otherUser.display_name}</p>
            <p className="text-sm text-slate-400">Say hello! 👋</p>
          </div>
        )}
        {msgs.map(m => {
          const isOwn = m.from_id === token;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
              {!isOwn && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-pink-400 flex items-center justify-center text-sm shrink-0 mb-0.5">
                  {otherUser.profile_picture}
                </div>
              )}
              <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                isOwn
                  ? "bg-gradient-to-r from-violet-600 to-pink-500 text-white rounded-br-md"
                  : "bg-white text-slate-800 rounded-bl-md border border-slate-100"
              }`}>
                <p className="leading-relaxed">{m.content}</p>
                <p className={`text-[10px] mt-1 ${isOwn ? "text-white/60" : "text-slate-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 flex gap-2 shrink-0">
        <input className="input flex-1 !rounded-full !py-2.5 !bg-slate-50" value={text}
          onChange={e => setText(e.target.value)} placeholder="Message…"
          onKeyDown={e => e.key === "Enter" && handleSend()} />
        <button onClick={handleSend} disabled={!text.trim()}
          className="w-11 h-11 bg-gradient-to-r from-violet-600 to-pink-500 rounded-full flex items-center justify-center shadow-md shadow-violet-500/20 disabled:opacity-40 transition-opacity shrink-0">
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ─── PROFILE ───────────────────────────────────────────────────────────────────

function ProfileScreen({ userId, currentUser, token, isOwnProfile, onBack, onLogout, navigate, setError }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get(`/users/${userId}`),
      api.get(`/posts?user_id=${userId}&radius=9999`),
    ])
      .then(([u, p]) => { setUser(u); setPosts(p.filter(post => post.author.id === userId)); })
      .catch(err => setError(err.message));
  }, [userId]);

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;

  const completedPosts = posts.filter(p => p.completed);
  const kudosPosts = completedPosts.filter(p => p.kudos?.id === userId);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 px-4 pt-12 pb-10 relative shadow-xl shadow-violet-500/20">
        <div className="flex justify-between mb-6">
          <button onClick={onBack} className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <ChevronLeft size={22} className="text-white" />
          </button>
          {isOwnProfile && (
            <button onClick={onLogout} className="px-4 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-semibold">
              Logout
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center text-5xl shadow-2xl">
            {user.profile_picture}
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-white">{user.display_name}</h2>
            <p className="text-white/70 text-sm flex items-center gap-1 mt-1">
              <MapPin size={12} />{user.location.city}, {user.location.state}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Star size={14} fill="#fbbf24" color="#fbbf24" />
              <span className="text-white font-bold">{user.trust_score.toFixed(1)}</span>
              <span className="text-white/50 text-xs">trust score</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats card - overlaps header */}
      <div className="mx-4 -mt-5 bg-white rounded-2xl shadow-lg border border-slate-100 grid grid-cols-3 divide-x divide-slate-100 z-10 relative">
        {[
          ["Posts", posts.length, "text-violet-600"],
          ["Resolved", completedPosts.length, "text-emerald-600"],
          ["Kudos", user.kudos_count, "text-amber-500"],
        ].map(([label, val, color]) => (
          <div key={label} className="flex flex-col items-center py-4 gap-0.5">
            <span className={`text-2xl font-extrabold ${color}`}>{val}</span>
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      <div className="p-4 mt-3 space-y-4">
        {/* Kids */}
        <div className="card p-4">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-base">
            <span className="text-xl">👶</span> Kids
          </h3>
          <div className="flex flex-wrap gap-2">
            {user.kids.length === 0
              ? <p className="text-sm text-slate-400">No kids added</p>
              : user.kids.map((kid, i) => (
                <span key={i} className="px-4 py-2 bg-violet-50 text-violet-700 rounded-full font-bold text-sm">
                  {kid.age} yrs
                </span>
              ))
            }
          </div>
        </div>

        {/* Kudos */}
        <div className="card p-4">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-base">
            <Award size={18} className="text-amber-500" /> Kudos Received
          </h3>
          {kudosPosts.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">🏆</p>
              <p className="text-sm text-slate-400">No kudos yet — start helping!</p>
            </div>
          ) : kudosPosts.map(p => (
            <div key={p.id} className="p-3 bg-amber-50 border border-amber-100 rounded-xl mb-2">
              <p className="text-sm text-slate-700 mb-1 leading-snug">{p.content.substring(0, 80)}…</p>
              <p className="text-xs text-amber-600 font-bold">From @{p.author.display_name}</p>
            </div>
          ))}
        </div>

        {/* Recent posts */}
        {posts.length > 0 && (
          <div className="card p-4">
            <h3 className="font-bold text-slate-800 mb-3 text-base">Recent Posts</h3>
            <div className="space-y-2">
              {posts.slice(0, 4).map(p => {
                const cfg = PRIORITY[p.priority] || PRIORITY["General"];
                return (
                  <div key={p.id} className={`p-3 rounded-xl bg-slate-50 ${cfg.leftBar}`}>
                    <p className="text-sm text-slate-700 leading-snug line-clamp-2">{p.content}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{p.priority}</span>
                      <span className="text-xs text-slate-400">{timeAgo(p.created_at)}</span>
                      {p.completed && <span className="text-xs text-emerald-600 font-bold">✓ Resolved</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <BottomNav active="profile" navigate={navigate} />
    </div>
  );
}

// ─── BOTTOM NAV ────────────────────────────────────────────────────────────────

function BottomNav({ active, navigate }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white/80 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around px-4 py-2 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <NavBtn icon={<Home size={22} />}    label="Feed"    active={active === "home"}          onClick={() => navigate("home")} />
      <NavBtn icon={<Bell size={22} />}    label="Alerts"  active={active === "notifications"} onClick={() => navigate("notifications")} />
      <NavBtn icon={<User size={22} />}    label="Profile" active={active === "profile"}       onClick={() => navigate("profile")} />
    </div>
  );
}

function NavBtn({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-2xl transition-all ${
        active ? "text-violet-600" : "text-slate-400 hover:text-slate-600"
      }`}>
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
      {active && <div className="w-1 h-1 rounded-full bg-violet-600" />}
    </button>
  );
}
