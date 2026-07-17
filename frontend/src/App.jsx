import { useState, useEffect, useRef } from "react";
import {
  Bell, MessageSquare, MapPin, Users, Award,
  Send, Share2, CheckCircle, AlertCircle, Info, X, Plus,
  Pencil, Trash2, Home, Search, LogOut, Clock, ChevronRight,
} from "lucide-react";

const API = "http://localhost:8000";

// ─────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────
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
  async patch(path, body = {}) {
    const res = await fetch(`${API}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
  },
  async delete(path) {
    const res = await fetch(`${API}${path}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
  },
};

const timeAgo = (ts) => {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken]             = useState(null);
  const [screen, setScreen]           = useState("auth");
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError]             = useState("");
  const [gpsLocation, setGpsLocation] = useState(null); // { lat, lng } | null
  const [statsTick, setStatsTick]     = useState(0);
  const refreshStats = () => setStatsTick(t => t + 1);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsLocation(null),   // denied or unavailable → fall back to stored location
      { timeout: 8000 },
    );
  }, []);

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
    setCurrentUser(user); setToken(tok);
    localStorage.setItem("parentshub_session", JSON.stringify({ user, token: tok }));
    setScreen("home");
  };

  const handleLogout = () => {
    localStorage.removeItem("parentshub_session");
    setCurrentUser(null); setToken(null); setScreen("auth");
  };

  const navigate = (s, post = null, user = null) => {
    setSelectedPost(post); setSelectedUser(user); setScreen(s);
  };

  if (screen === "auth") return <AuthScreen onLogin={handleLogin} setError={setError} error={error} clearError={() => setError("")} />;

  const isFeedScreen = ["home", "newPost", "postDetail"].includes(screen);

  return (
    <div className="min-h-screen bg-gray-100">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-red-50 border border-red-300 text-red-700 px-5 py-3 rounded-xl flex items-center gap-3 shadow-lg">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}

      <TopNav
        currentUser={currentUser}
        screen={screen}
        navigate={navigate}
        unreadCount={unreadCount}
        onLogout={handleLogout}
      />

      <div className="pt-14 max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-5 py-5 items-start">
          <LeftSidebar currentUser={currentUser} screen={screen} navigate={navigate} onLogout={handleLogout} />

          <div className="min-w-0">
            {isFeedScreen && (
              <FeedPanel
                currentUser={currentUser}
                token={token}
                navigate={navigate}
                setError={setError}
                gpsLocation={gpsLocation}
              />
            )}
            {screen === "notifications" && (
              <NotificationsPanel
                token={token}
                onViewPost={(post) => navigate("postDetail", post)}
                setError={setError}
              />
            )}
            {screen === "profile" && (
              <ProfilePanel
                userId={selectedUser ? selectedUser.id : token}
                currentUser={currentUser}
                token={token}
                isOwnProfile={!selectedUser || selectedUser.id === token}
                navigate={navigate}
                setError={setError}
              />
            )}
            {screen === "chat" && selectedUser && (
              <ChatPanel
                currentUser={currentUser}
                token={token}
                otherUser={selectedUser}
                navigate={navigate}
                setError={setError}
              />
            )}
          </div>

          <RightSidebar token={token} navigate={navigate} gpsLocation={gpsLocation} statsTick={statsTick} />
        </div>
      </div>

      {screen === "newPost" && (
        <NewPostModal token={token} onClose={() => navigate("home")} onPosted={() => { navigate("home"); refreshStats(); }} setError={setError} />
      )}
      {screen === "postDetail" && selectedPost && (
        <PostDetailModal
          postId={selectedPost.id}
          token={token}
          currentUser={currentUser}
          onClose={() => navigate("home")}
          onMessageUser={(user) => navigate("chat", null, user)}
          onViewProfile={(user) => navigate("profile", null, user)}
          onDataChanged={refreshStats}
          setError={setError}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TOP NAV
// ─────────────────────────────────────────────
function TopNav({ currentUser, screen, navigate, unreadCount, onLogout }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-14 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-full flex items-center gap-4">
        <button onClick={() => navigate("home")} className="flex items-center gap-2 text-purple-700 font-bold text-xl shrink-0">
          <span className="text-2xl">👨‍👩‍👧‍👦</span>
          <span className="hidden sm:block">ParentsHub</span>
        </button>

        <div className="flex-1 max-w-xs hidden md:block">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" placeholder="Search posts…" readOnly />
          </div>
        </div>

        <nav className="flex items-center gap-1 ml-auto">
          <NavTab icon={<Home size={20} />} label="Feed" active={screen === "home"} onClick={() => navigate("home")} />
          <NavTab
            icon={
              <div className="relative">
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadCount}</span>
                )}
              </div>
            }
            label="Alerts"
            active={screen === "notifications"}
            onClick={() => navigate("notifications")}
          />
          <NavTab icon={<Users size={20} />} label="Profile" active={screen === "profile" && true} onClick={() => navigate("profile")} />
        </nav>

        <button
          onClick={() => navigate("newPost")}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-full text-sm font-semibold transition shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:block">New Post</span>
        </button>

        <button onClick={() => navigate("profile")} className="text-2xl leading-none shrink-0" title="Your profile">
          {currentUser.profile_picture}
        </button>
      </div>
    </header>
  );
}

function NavTab({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg text-xs font-medium transition ${active ? "text-purple-600 bg-purple-50" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"}`}
    >
      {icon}
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────
// LEFT SIDEBAR
// ─────────────────────────────────────────────
function LeftSidebar({ currentUser, screen, navigate, onLogout }) {
  return (
    <aside className="hidden lg:flex flex-col gap-4 sticky top-20">
      {/* Profile card */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="h-16 bg-gradient-to-r from-purple-600 to-pink-500" />
        <div className="px-4 pb-4">
          <div className="flex items-end gap-3 -mt-7 mb-3">
            <div className="text-4xl w-14 h-14 bg-white rounded-full flex items-center justify-center shadow border-2 border-white shrink-0">
              {currentUser.profile_picture}
            </div>
          </div>
          <p className="font-bold text-gray-900 text-sm">{currentUser.display_name}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <MapPin size={11} />{currentUser.location?.city}, {currentUser.location?.state}
          </p>
          <div className={`mt-3 pt-3 border-t grid text-center text-xs gap-1 ${currentUser.kudos_count > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
            <div><p className="font-bold text-gray-900">{currentUser.kids?.length || 0}</p><p className="text-gray-400">kids</p></div>
            <div><p className="font-bold text-gray-900">{currentUser.kudos_count || 0}</p><p className="text-gray-400">kudos</p></div>
            {currentUser.kudos_count > 0 && (
              <div><p className="font-bold text-yellow-500">{"★".repeat(Math.round(currentUser.trust_score || 0))}</p><p className="text-gray-400">{(currentUser.trust_score || 0).toFixed(1)} avg</p></div>
            )}
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div className="bg-white rounded-xl shadow-sm p-2">
        <SideLink icon={<Home size={18} />} label="Feed" active={screen === "home"} onClick={() => navigate("home")} />
        <SideLink icon={<Bell size={18} />} label="Notifications" active={screen === "notifications"} onClick={() => navigate("notifications")} />
        <SideLink icon={<MessageSquare size={18} />} label="Messages" active={screen === "chat"} onClick={() => navigate("chat")} />
        <SideLink icon={<Users size={18} />} label="My Profile" active={screen === "profile"} onClick={() => navigate("profile")} />
        <hr className="my-1 border-gray-100" />
        <SideLink icon={<LogOut size={18} />} label="Logout" onClick={onLogout} danger />
      </div>
    </aside>
  );
}

function SideLink({ icon, label, active, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
        danger ? "text-red-500 hover:bg-red-50" :
        active  ? "text-purple-700 bg-purple-50" :
                  "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// RIGHT SIDEBAR
// ─────────────────────────────────────────────
function RightSidebar({ token, gpsLocation, statsTick }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!token) return;
    const gps = gpsLocation ? `&lat=${gpsLocation.lat}&lng=${gpsLocation.lng}` : "";
    api.get(`/stats?user_id=${token}${gps}`).then(setStats).catch(() => {});
  }, [token, gpsLocation, statsTick]);

  return (
    <aside className="hidden lg:flex flex-col gap-4 sticky top-20">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">Nearby Community</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Parents nearby</span>
            <span className="font-semibold text-gray-800">{stats?.parents_nearby ?? "—"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Open requests</span>
            <span className="font-semibold text-gray-800">{stats?.open_posts ?? "—"}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Within your selected radius</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-gray-800 text-sm mb-2">About ParentsHub</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          A hyperlocal parent help network — connect with families in your neighborhood for real-time help and support.
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {["#parenting","#community","#help","#local"].map(t => (
            <span key={t} className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 px-1 leading-relaxed">
        © 2026 ParentsHub · Powered by PostGIS
      </p>
    </aside>
  );
}

// ─────────────────────────────────────────────
// FEED PANEL
// ─────────────────────────────────────────────
function FeedPanel({ currentUser, token, navigate, setError, gpsLocation }) {
  const [posts, setPosts] = useState([]);
  const [radius, setRadius] = useState(20);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      const gps = gpsLocation ? `&lat=${gpsLocation.lat}&lng=${gpsLocation.lng}` : "";
      const data = await api.get(`/posts?user_id=${token}&radius=${radius}${gps}`);
      setPosts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [radius, gpsLocation]);
  useEffect(() => { const id = setInterval(fetchPosts, 15000); return () => clearInterval(id); }, [radius, gpsLocation]);

  return (
    <div className="space-y-4">
      {/* Create post box */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{currentUser.profile_picture}</span>
          <button
            onClick={() => navigate("newPost")}
            className="flex-1 text-left px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-500 transition"
          >
            What do you need, {currentUser.display_name.split(" ")[0]}?
          </button>
        </div>
        <div className="flex gap-3 mt-3 pt-3 border-t">
          <button onClick={() => navigate("newPost")} className="flex items-center gap-2 text-sm text-gray-600 hover:text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition">
            <AlertCircle size={16} className="text-red-500" /> Emergency
          </button>
          <button onClick={() => navigate("newPost")} className="flex items-center gap-2 text-sm text-gray-600 hover:text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition">
            <Info size={16} className="text-orange-500" /> Important
          </button>
          <button onClick={() => navigate("newPost")} className="flex items-center gap-2 text-sm text-gray-600 hover:text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition">
            <MessageSquare size={16} className="text-blue-500" /> General
          </button>
        </div>
      </div>

      {/* Radius filter */}
      <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 text-sm">
        <MapPin size={16} className="text-purple-600 shrink-0" />
        <span className="text-gray-600 font-medium">Showing requests within</span>
        <select
          value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          className="ml-auto input py-1 px-3 text-sm w-36"
        >
          {[5,10,15,20,25,30,35,40,45,50].map(r => (
            <option key={r} value={r}>{r} miles</option>
          ))}
        </select>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <div className="animate-pulse text-4xl mb-3">📍</div>
          <p>Loading nearby requests…</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-600">No nearby requests</p>
          <p className="text-sm mt-1">Be the first to post in your neighborhood!</p>
          <button onClick={() => navigate("newPost")} className="mt-4 btn-primary px-5 py-2 text-sm rounded-full">
            Create a request
          </button>
        </div>
      ) : (
        posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onClick={() => navigate("postDetail", post)}
            onViewProfile={(user) => navigate("profile", null, user)}
          />
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// POST CARD
// ─────────────────────────────────────────────
const PRIORITY_STYLE = {
  "Emergency Medical": { badge: "bg-red-100 text-red-700 border border-red-200", icon: <AlertCircle size={13} />, dot: "bg-red-500" },
  "Important":         { badge: "bg-orange-100 text-orange-700 border border-orange-200", icon: <Info size={13} />, dot: "bg-orange-500" },
  "General":           { badge: "bg-blue-100 text-blue-700 border border-blue-200", icon: <MessageSquare size={13} />, dot: "bg-blue-500" },
};

function PostCard({ post, onClick, onViewProfile }) {
  const hoursLeft = Math.max(0, Math.floor((post.expires_at - Date.now()) / 3600000));
  const p = PRIORITY_STYLE[post.priority] || PRIORITY_STYLE["General"];

  return (
    <article className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      {/* Author row */}
      <div className="px-5 pt-4 pb-3 flex items-start gap-3">
        <button
          className="text-4xl leading-none shrink-0"
          onClick={e => { e.stopPropagation(); onViewProfile?.(post.author); }}
        >
          {post.author.profile_picture}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="font-semibold text-gray-900 hover:text-purple-700 hover:underline text-sm"
              onClick={e => { e.stopPropagation(); onViewProfile?.(post.author); }}
            >
              {post.author.display_name}
            </button>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${p.badge}`}>
              {p.icon} {post.priority}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
            <MapPin size={11} />{post.author.location.city}, {post.author.location.state}
            <span>·</span>
            <Clock size={11} />{timeAgo(post.created_at)}
            <span>·</span>
            <span>{post.radius}mi radius</span>
            {hoursLeft <= 6 && <span className="text-amber-600 font-semibold">· {hoursLeft}h left</span>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-3">
        <p className="text-gray-800 text-sm leading-relaxed">
          {post.content.length > 200 ? post.content.slice(0, 200) + "…" : post.content}
        </p>
        {post.content.length > 200 && (
          <span className="text-xs text-purple-600 font-medium cursor-pointer hover:underline">See more</span>
        )}
      </div>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {post.tags.map((t, i) => (
            <span key={i} className="text-xs text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full font-medium">#{t}</span>
          ))}
        </div>
      )}

      {post.age_range && (
        <div className="px-5 pb-3">
          <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
            👶 Kids ages {post.age_range[0]}–{post.age_range[1]}
          </span>
        </div>
      )}

      {post.completed && (
        <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle size={15} className="text-green-600 shrink-0" />
          <span className="text-xs text-green-800 font-semibold">Resolved · Kudos to @{post.kudos?.display_name}</span>
        </div>
      )}

      {/* Actions bar */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5 hover:text-purple-600 transition">
          <MessageSquare size={15} /> {post.comments?.length || 0} comments
        </span>
        <span className="flex items-center gap-1.5 hover:text-purple-600 transition">
          <Share2 size={15} /> {post.shares || 0} shares
        </span>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────
// NEW POST MODAL
// ─────────────────────────────────────────────
function NewPostModal({ token, onClose, onPosted, setError }) {
  const [form, setForm] = useState({ content: "", priority: "General", radius: 20, tags: [], age_range: null });
  const [tagInput, setTagInput] = useState("");
  const [useAge, setUseAge] = useState(false);
  const [ageMin, setAgeMin] = useState(0);
  const [ageMax, setAgeMax] = useState(18);
  const [loading, setLoading] = useState(false);
  const POST_LIMIT = 500;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = () => {
    if (tagInput.trim()) { setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] })); setTagInput(""); }
  };

  const handlePost = async () => {
    if (!form.content.trim()) { setError("Please describe what you need."); return; }
    if (form.content.length > POST_LIMIT) { setError(`Post must be ${POST_LIMIT} characters or less.`); return; }
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
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-900">Create a Request</h2>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
            <button
              onClick={handlePost}
              disabled={loading}
              className="btn-primary px-5 py-2 rounded-full text-sm disabled:opacity-50"
            >
              {loading ? "Posting…" : "Post"}
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div>
            <label className="label">What do you need? *</label>
            <textarea
              className={`input resize-none ${form.content.length > POST_LIMIT ? "border-red-400 focus:ring-red-400" : ""}`}
              rows={4}
              placeholder="e.g. Need children's Tylenol urgently. My son has a fever and we've run out…"
              value={form.content}
              onChange={e => { set("content", e.target.value); setError(""); }}
              autoFocus
            />
            <div className={`flex justify-end text-xs mt-1 ${form.content.length > POST_LIMIT ? "text-red-500 font-semibold" : form.content.length > POST_LIMIT * 0.9 ? "text-orange-500" : "text-gray-400"}`}>
              {form.content.length}/{POST_LIMIT}
            </div>
          </div>

          <div>
            <label className="label">Priority Level *</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Emergency Medical", "Urgent health needs", <AlertCircle size={18} className="text-red-500" />],
                ["Important", "Time-sensitive", <Info size={18} className="text-orange-500" />],
                ["General", "Regular questions", <MessageSquare size={18} className="text-blue-500" />],
              ].map(([p, desc, icon]) => (
                <button
                  key={p} type="button" onClick={() => set("priority", p)}
                  className={`text-left px-4 py-3 rounded-xl border-2 transition ${form.priority === p ? "border-purple-600 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="mb-1">{icon}</div>
                  <div className="font-semibold text-sm text-gray-800">{p}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="label">Search Radius</label>
              <select
                value={form.radius}
                onChange={e => set("radius", Number(e.target.value))}
                className="input py-2"
              >
                {[5,10,15,20,25,30,35,40,45,50].map(r => (
                  <option key={r} value={r}>{r} miles</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Tags (optional)</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 py-2"
                  placeholder="Add tag, press Enter"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <button type="button" onClick={addTag} className="btn-primary px-3 py-2 rounded-lg text-sm">Add</button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map((t, i) => (
                    <span key={i} className="tag flex items-center gap-1 text-xs">
                      #{t} <X size={11} className="cursor-pointer" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useAge} onChange={e => setUseAge(e.target.checked)} className="w-4 h-4 accent-purple-600" />
              <span className="text-sm font-semibold text-gray-700">Filter by kid age range (optional)</span>
            </label>
            {useAge && (
              <div className="flex gap-4 mt-3 pl-6">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Min age</label>
                  <input type="number" min="0" max="18" className="input py-2" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Max age</label>
                  <input type="number" min="0" max="18" className="input py-2" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-800">
            📍 Visible to parents within <strong>{form.radius} miles</strong> for <strong>24 hours</strong>
            {useAge && ` · Only parents with kids ages ${ageMin}–${ageMax} notified`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// POST DETAIL MODAL
// ─────────────────────────────────────────────
function PostDetailModal({ postId, token, currentUser, onClose, onMessageUser, onViewProfile, onDataChanged, setError }) {
  const [post, setPost] = useState(null);
  const [comment, setComment] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [kudosCommenterId, setKudosCommenterId] = useState(null); // which comment's kudos picker is open
  const [kudosStars, setKudosStars] = useState(5);
  const [kudosLoading, setKudosLoading] = useState(false);
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
    if (!post) return;
    const text = `${post.author.display_name} needs help: "${post.content}"`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ParentsHub request", text });
      } else {
        await navigator.clipboard.writeText(text);
        setError("Copied to clipboard!");
        setTimeout(() => setError(""), 2500);
      }
      await api.post(`/posts/${postId}/share?user_id=${token}`, {});
      fetchPost();
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    }
  };

  const handleResolve = async () => {
    try { await api.post(`/posts/${postId}/complete?user_id=${token}`, {}); fetchPost(); onDataChanged?.(); }
    catch (err) { setError(err.message); }
  };

  const handleGiveKudos = async (commenterId) => {
    setKudosLoading(true);
    try {
      await api.post(`/posts/${postId}/complete?user_id=${token}`, { kudos_user_id: commenterId, stars: kudosStars });
      setKudosCommenterId(null);
      setKudosStars(5);
      fetchPost();
      onDataChanged?.();
    } catch (err) { setError(err.message); }
    finally { setKudosLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try { await api.delete(`/posts/${postId}?user_id=${token}`); onClose(); onDataChanged?.(); }
    catch (err) { setError(err.message); }
  };

  if (loading) return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 text-gray-500">Loading…</div>
    </div>
  );
  if (!post) return null;

  const isAuthor = post.author.id === token;
  const p = PRIORITY_STYLE[post.priority] || PRIORITY_STYLE["General"];

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-900">Request Details</h2>
          <div className="flex items-center gap-2">
            {isAuthor && !post.completed && (
              <>
                <button onClick={() => setShowEdit(true)} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"><Pencil size={18} /></button>
                <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={18} /></button>
              </>
            )}
            <button onClick={handleShare} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"><Share2 size={18} /></button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"><X size={20} /></button>
          </div>
        </div>

        {/* Body — two columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: post info */}
          <div className="w-[55%] border-r overflow-y-auto p-6 space-y-4">
            {/* Author */}
            <div className="flex items-start gap-3">
              <button className="text-4xl leading-none" onClick={() => { onViewProfile(post.author); onClose(); }}>{post.author.profile_picture}</button>
              <div>
                <button className="font-semibold text-gray-900 hover:underline" onClick={() => { onViewProfile(post.author); onClose(); }}>{post.author.display_name}</button>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <MapPin size={11} />{post.author.location.city}, {post.author.location.state}
                  <span>·</span>{timeAgo(post.created_at)}
                </div>
              </div>
              <span className={`ml-auto inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${p.badge}`}>
                {p.icon} {post.priority}
              </span>
            </div>

            <p className="text-gray-800 leading-relaxed">{post.content}</p>

            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((t, i) => <span key={i} className="tag text-xs">#{t}</span>)}
              </div>
            )}

            {post.age_range && (
              <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full inline-block">
                👶 Kids ages {post.age_range[0]}–{post.age_range[1]}
              </span>
            )}

            <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t">
              <span className="flex items-center gap-1"><MapPin size={12} />{post.radius} mile radius</span>
              <span className="flex items-center gap-1"><Clock size={12} />{Math.max(0, Math.floor((post.expires_at - Date.now()) / 3600000))}h remaining</span>
              <span className="flex items-center gap-1"><Share2 size={12} />{post.shares} shares</span>
            </div>

            {post.completed && (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle size={18} className="text-green-600" />
                <span className="text-sm text-green-800 font-semibold">Resolved</span>
              </div>
            )}

            {isAuthor && !post.completed && (
              <button
                onClick={handleResolve}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition"
              >
                <CheckCircle size={18} /> Mark as Resolved
              </button>
            )}

            {!isAuthor && (
              <button
                onClick={() => { onMessageUser(post.author); onClose(); }}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition"
              >
                <MessageSquare size={18} /> Message {post.author.display_name}
              </button>
            )}
          </div>

          {/* Right: comments */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-800">Comments ({post.comments.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {post.comments.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No comments yet. Be the first to help!</p>
                </div>
              ) : post.comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <button className="text-2xl leading-none shrink-0" onClick={() => { onViewProfile(c.author); onClose(); }}>{c.author.profile_picture}</button>
                  <div className="flex-1">
                    <div className="bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <button className="font-semibold text-xs text-gray-800 hover:underline" onClick={() => { onViewProfile(c.author); onClose(); }}>{c.author.display_name}</button>
                        <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-700">{c.content}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {!isAuthor && c.author.id !== token && (
                          <button onClick={() => { onMessageUser(c.author); onClose(); }} className="text-xs text-purple-600 hover:underline">
                            Message privately
                          </button>
                        )}
                        {isAuthor && c.author.id !== token && !post.completed && (
                          <button
                            onClick={() => { setKudosCommenterId(kudosCommenterId === c.author.id ? null : c.author.id); setKudosStars(5); }}
                            className="text-xs text-yellow-600 hover:text-yellow-700 font-medium flex items-center gap-1"
                          >
                            <Award size={12} /> Give Kudos
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Inline star picker */}
                    {kudosCommenterId === c.author.id && (
                      <div className="mt-2 ml-1 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Rate {c.author.display_name}'s help</p>
                        <div className="flex items-center gap-1 mb-3">
                          {[1,2,3,4,5].map(s => (
                            <button key={s} onClick={() => setKudosStars(s)}
                              className={`text-2xl transition-transform hover:scale-110 ${s <= kudosStars ? "text-yellow-400" : "text-gray-300"}`}>★</button>
                          ))}
                          <span className="ml-1 text-xs text-gray-500">{kudosStars}/5</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setKudosCommenterId(null)} className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                          <button
                            onClick={() => handleGiveKudos(c.author.id)}
                            disabled={kudosLoading}
                            className="flex-1 py-1.5 text-xs bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-semibold disabled:opacity-50"
                          >
                            {kudosLoading ? "Sending…" : "Give Kudos & Resolve"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!post.completed && (
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <input
                    className="input flex-1 py-2"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Write a comment…"
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                  />
                  <button onClick={handleComment} className="btn-primary px-4 py-2 rounded-lg"><Send size={16} /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditPostModal
          post={post} token={token}
          onSaved={() => { setShowEdit(false); fetchPost(); }}
          onClose={() => setShowEdit(false)}
          setError={setError}
        />
      )}

    </div>
  );
}

// ─────────────────────────────────────────────
// EDIT POST MODAL
// ─────────────────────────────────────────────
function EditPostModal({ post, token, onSaved, onClose, setError }) {
  const [form, setForm] = useState({ content: post.content, priority: post.priority, radius: post.radius, tags: post.tags || [], age_range: post.age_range });
  const [tagInput, setTagInput] = useState("");
  const [useAge, setUseAge] = useState(!!post.age_range);
  const [ageMin, setAgeMin] = useState(post.age_range?.[0] ?? 0);
  const [ageMax, setAgeMax] = useState(post.age_range?.[1] ?? 18);
  const [loading, setLoading] = useState(false);

  const POST_LIMIT = 500;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addTag = () => { if (tagInput.trim()) { setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] })); setTagInput(""); } };

  const handleSave = async () => {
    if (!form.content.trim()) { setError("Content cannot be empty."); return; }
    if (form.content.length > POST_LIMIT) { setError(`Post must be ${POST_LIMIT} characters or less.`); return; }
    setLoading(true);
    try {
      await api.patch(`/posts/${post.id}?user_id=${token}`, { ...form, age_range: useAge ? [ageMin, ageMax] : null });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-lg">Edit Post</h3>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
            <button onClick={handleSave} disabled={loading} className="btn-primary px-5 py-2 rounded-full text-sm disabled:opacity-50">
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          <div>
            <label className="label">What do you need? *</label>
            <textarea
              className={`input resize-none ${form.content.length > POST_LIMIT ? "border-red-400 focus:ring-red-400" : ""}`}
              rows={4}
              value={form.content}
              onChange={e => { set("content", e.target.value); setError(""); }}
            />
            <div className={`flex justify-end text-xs mt-1 ${form.content.length > POST_LIMIT ? "text-red-500 font-semibold" : form.content.length > POST_LIMIT * 0.9 ? "text-orange-500" : "text-gray-400"}`}>
              {form.content.length}/{POST_LIMIT}
            </div>
          </div>
          <div>
            <label className="label">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {["Emergency Medical","Important","General"].map(p => (
                <button key={p} type="button" onClick={() => set("priority", p)}
                  className={`py-2 px-3 rounded-xl border-2 text-sm font-medium transition ${form.priority === p ? "border-purple-600 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Radius</label>
            <select
              value={form.radius}
              onChange={e => set("radius", Number(e.target.value))}
              className="input py-2"
            >
              {[5,10,15,20,25,30,35,40,45,50].map(r => (
                <option key={r} value={r}>{r} miles</option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useAge} onChange={e => setUseAge(e.target.checked)} className="w-4 h-4 accent-purple-600" />
              <span className="text-sm font-semibold text-gray-700">Filter by age</span>
            </label>
            {useAge && (
              <div className="flex gap-4 mt-2 pl-6">
                <div className="flex-1"><label className="text-xs text-gray-500 block mb-1">Min</label><input type="number" min="0" max="18" className="input py-2" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} /></div>
                <div className="flex-1"><label className="text-xs text-gray-500 block mb-1">Max</label><input type="number" min="0" max="18" className="input py-2" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} /></div>
              </div>
            )}
          </div>
          <div>
            <label className="label">Tags</label>
            <div className="flex gap-2">
              <input className="input flex-1 py-2" placeholder="Tag…" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} />
              <button type="button" onClick={addTag} className="btn-primary px-3 py-2 rounded-lg text-sm">Add</button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((t, i) => (
                  <span key={i} className="tag flex items-center gap-1 text-xs">#{t} <X size={11} className="cursor-pointer" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))} /></span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NOTIFICATIONS PANEL
// ─────────────────────────────────────────────
function NotificationsPanel({ token, onViewPost, setError }) {
  const [notifs, setNotifs] = useState([]);
  const [selectedNotif, setSelectedNotif] = useState(null);

  useEffect(() => {
    api.get(`/notifications/${token}`).then(setNotifs).catch(err => setError(err.message));
  }, []);

  const markRead = async (n) => {
    if (!n.read) {
      await api.patch(`/notifications/${n.id}/read`);
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  const handleClick = async (n) => {
    await markRead(n);
    setSelectedNotif({ ...n, read: true });
  };

  const handleViewPost = () => {
    if (selectedNotif?.post_id) {
      setSelectedNotif(null);
      onViewPost({ id: selectedNotif.post_id });
    }
  };

  const PREVIEW_LIMIT = 100;

  const typeIcon = {
    new_post: <Bell size={18} />,
    comment:  <MessageSquare size={18} />,
    share:    <Share2 size={18} />,
    kudos:    <Award size={18} />,
    message:  <Send size={18} />,
  };

  const typeLabel = {
    new_post: "New Post",
    comment:  "Comment",
    share:    "Share",
    kudos:    "Kudos",
    message:  "Message",
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="font-bold text-lg text-gray-900">Notifications</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {notifs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Bell size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : notifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition ${!n.read ? "bg-purple-50" : ""}`}
            >
              <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${n.read ? "bg-gray-100 text-gray-400" : "bg-purple-100 text-purple-600"}`}>
                {typeIcon[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.read ? "text-gray-600" : "text-gray-900 font-semibold"}`}>
                  {n.content.length > PREVIEW_LIMIT ? n.content.slice(0, PREVIEW_LIMIT) + "…" : n.content}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && <div className="shrink-0 w-2 h-2 bg-purple-600 rounded-full mt-2" />}
            </div>
          ))}
        </div>
      </div>

      {selectedNotif && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedNotif(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                  {typeIcon[selectedNotif.type]}
                </div>
                <span className="font-semibold text-gray-800">{typeLabel[selectedNotif.type] ?? "Notification"}</span>
              </div>
              <button onClick={() => setSelectedNotif(null)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <p className="text-gray-800 leading-relaxed mb-4">{selectedNotif.content}</p>
            <p className="text-xs text-gray-400 mb-5">{timeAgo(selectedNotif.created_at)}</p>
            {selectedNotif.post_id && (
              <button onClick={handleViewPost} className="w-full btn-primary py-2 rounded-full text-sm">
                View Post
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// CHAT PANEL
// ─────────────────────────────────────────────
function ChatPanel({ currentUser, token, otherUser, navigate, setError }) {
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
    <div className="bg-white rounded-xl shadow-sm flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center gap-3">
        <button onClick={() => navigate("home")} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        <span className="text-3xl">{otherUser.profile_picture}</span>
        <div>
          <p className="font-bold text-gray-900">{otherUser.display_name}</p>
          <p className="text-xs text-gray-500">{otherUser.location?.city}, {otherUser.location?.state}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {msgs.length === 0 && <p className="text-center text-gray-400 text-sm mt-10">No messages yet. Say hello!</p>}
        {msgs.map(m => {
          const isOwn = m.from_id === token;
          return (
            <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${isOwn ? "bg-purple-600 text-white rounded-br-none" : "bg-gray-100 text-gray-800 rounded-bl-none"}`}>
                {m.content}
                <p className={`text-xs mt-1 ${isOwn ? "text-purple-200" : "text-gray-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-3">
          <input
            className="input flex-1 rounded-full"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={e => e.key === "Enter" && handleSend()}
          />
          <button onClick={handleSend} className="btn-primary w-11 h-11 rounded-full">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PROFILE PANEL
// ─────────────────────────────────────────────
function ProfilePanel({ userId, currentUser, token, isOwnProfile, navigate, setError }) {
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

  if (!user) return (
    <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Loading profile…</div>
  );

  const completedPosts = posts.filter(p => p.completed);

  return (
    <div className="space-y-4">
      {/* Profile header */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-purple-600 to-pink-500" />
        <div className="px-6 pb-5">
          <div className="flex items-end justify-between -mt-10 mb-4">
            <div className="text-6xl w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-white">
              {user.profile_picture}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{user.display_name}</h1>
          <p className="text-gray-500 text-sm flex items-center gap-1 mt-1">
            <MapPin size={14} />{user.location.city}, {user.location.state}
          </p>

          <div className={`grid gap-4 mt-5 pt-4 border-t ${user.kudos_count > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{posts.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Posts</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{user.kudos_count || 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">Kudos received</p>
            </div>
            {user.kudos_count > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-500">{(user.trust_score || 0).toFixed(1)} ★</p>
                <p className="text-xs text-gray-500 mt-0.5">Avg rating</p>
              </div>
            )}
          </div>

          {user.kids?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Kids</p>
              <div className="flex flex-wrap gap-2">
                {user.kids.map((k, i) => (
                  <span key={i} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">{k.age} yrs</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b">
          <h3 className="font-bold text-gray-900">Posts ({posts.length})</h3>
        </div>
        {posts.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No posts yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {posts.map(post => (
              <div key={post.id} className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition" onClick={() => navigate("postDetail", post)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span>{timeAgo(post.created_at)}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${PRIORITY_STYLE[post.priority]?.badge}`}>
                        {post.priority}
                      </span>
                      {post.completed && <span className="text-green-600 font-semibold">✓ Resolved</span>}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────
function AuthScreen({ onLogin, setError, error, clearError }) {
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", display_name: "", password: "",
    phone: "", id_verified: false,
    location: { address: "", city: "", state: "", zip: "" },
    kids: [],
  });
  const [kidAge, setKidAge] = useState("");

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setLoc = (field, val) => setForm(f => ({ ...f, location: { ...f.location, [field]: val } }));

  const handleZipChange = async (zip) => {
    setLoc("zip", zip);
    if (zip.length === 5 && /^\d{5}$/.test(zip)) {
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
        if (res.ok) {
          const data = await res.json();
          const place = data.places[0];
          setForm(f => ({
            ...f,
            location: { ...f.location, zip, state: place["state abbreviation"], city: place["place name"] },
          }));
        }
      } catch (_) {}
    }
  };

  const addKid = () => {
    const age = parseInt(kidAge);
    if (age >= 0 && age <= 18) {
      setForm(f => ({ ...f, kids: [...f.kids, { age, id: Date.now() }] }));
      setKidAge("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    try {
      if (isSignup) {
        if (form.kids.length === 0) throw new Error("Please add at least one child.");
        const data = await api.post("/auth/register", {
          ...form, profile_picture: "👤",
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
    <div className="min-h-screen flex">
      {/* Left hero panel */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-purple-700 via-purple-600 to-pink-600 flex-col items-center justify-center p-12 text-white">
        <div className="max-w-sm">
          <div className="text-7xl mb-6">👨‍👩‍👧‍👦</div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">Your village, always nearby</h1>
          <p className="text-purple-100 text-lg leading-relaxed mb-8">
            ParentsHub connects local parents for real-time help — from urgent medicine runs to babysitting swaps.
          </p>
          <div className="space-y-4">
            {[
              ["📍", "Hyperlocal", "See requests within miles of you"],
              ["⏱️", "Real-time", "Posts expire in 24h — always fresh"],
              ["🏆", "Trusted", "Kudos system rewards helpful parents"],
            ].map(([emoji, title, desc]) => (
              <div key={title} className="flex items-start gap-3">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-purple-200 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
          <div className="text-center mb-8 lg:hidden">
            <div className="text-5xl mb-2">👨‍👩‍👧‍👦</div>
            <h1 className="text-2xl font-bold text-gray-900">ParentsHub</h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {isSignup ? "Create your account" : "Welcome back"}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {isSignup ? "Join your local parent community." : "Sign in to your account."}
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center justify-between">
              {error} <button onClick={clearError}><X size={14} /></button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignup && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder="Full Name *" value={form.name} onChange={e => set("name", e.target.value)} required />
                  <input className="input" placeholder="Display Name *" value={form.display_name} onChange={e => set("display_name", e.target.value)} required />
                </div>
                <input className="input" placeholder="Phone Number *" value={form.phone} onChange={e => set("phone", e.target.value)} required />
                <input className="input" placeholder="Address Line *" value={form.location.address} onChange={e => setLoc("address", e.target.value)} required />
                <div className="grid grid-cols-3 gap-2">
                  <input className="input text-sm" placeholder="City *" value={form.location.city} onChange={e => setLoc("city", e.target.value)} required />
                  <input className="input text-sm" placeholder="State *" value={form.location.state} onChange={e => setLoc("state", e.target.value)} required />
                  <input className="input text-sm" placeholder="ZIP *" value={form.location.zip} onChange={e => handleZipChange(e.target.value)} required />
                </div>
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">Kids Ages (0–18) *</label>
                  <div className="flex gap-2">
                    <input type="number" min="0" max="18" className="input flex-1 py-2" placeholder="Age" value={kidAge} onChange={e => setKidAge(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKid())} />
                    <button type="button" onClick={addKid} className="btn-primary px-4 py-2 rounded-lg text-sm">Add</button>
                  </div>
                  {form.kids.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.kids.map(k => (
                        <span key={k.id} className="tag flex items-center gap-1 text-sm">
                          {k.age} yrs
                          <X size={12} className="cursor-pointer" onClick={() => setForm(f => ({ ...f, kids: f.kids.filter(x => x.id !== k.id) }))} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <input className="input" type="email" placeholder="Email *" value={form.email} onChange={e => set("email", e.target.value)} required />
            <input className="input" type="password" placeholder="Password *" value={form.password} onChange={e => set("password", e.target.value)} required />

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl text-base mt-2 disabled:opacity-60">
              {loading ? "Please wait…" : isSignup ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="text-center mt-5">
            <button onClick={() => { setIsSignup(!isSignup); clearError(); }} className="text-purple-600 text-sm font-medium hover:underline">
              {isSignup ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
