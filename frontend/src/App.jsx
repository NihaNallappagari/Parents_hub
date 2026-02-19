import { useState, useEffect, useRef } from "react";
import {
  Bell, MessageSquare, MapPin, Users, Award, Star,
  Send, Share2, CheckCircle, AlertCircle, Info, X, Plus, Filter
} from "lucide-react";

const API = "http://localhost:8000";

// ─────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [screen, setScreen] = useState("auth");
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem("parentshub_session");
    if (saved) {
      const { user, token } = JSON.parse(saved);
      setCurrentUser(user);
      setToken(token);
      setScreen("home");
    }
  }, []);

  // Poll unread notifications
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
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="text-sm">{error}</span>
          <X size={16} className="cursor-pointer" onClick={() => setError("")} />
        </div>
      )}

      {screen === "auth" && <AuthScreen onLogin={handleLogin} setError={setError} />}
      {screen === "home" && currentUser && (
        <HomeScreen
          currentUser={currentUser}
          token={token}
          navigate={navigate}
          unreadCount={unreadCount}
          setError={setError}
        />
      )}
      {screen === "newPost" && currentUser && (
        <NewPostScreen
          token={token}
          onBack={() => setScreen("home")}
          onPosted={() => setScreen("home")}
          setError={setError}
        />
      )}
      {screen === "postDetail" && selectedPost && (
        <PostDetailScreen
          postId={selectedPost.id}
          token={token}
          currentUser={currentUser}
          onBack={() => navigate("home")}
          onMessageUser={(user) => navigate("chat", null, user)}
          setError={setError}
        />
      )}
      {screen === "notifications" && (
        <NotificationsScreen
          token={token}
          onBack={() => setScreen("home")}
          onViewPost={(post) => navigate("postDetail", post)}
          setError={setError}
        />
      )}
      {screen === "chat" && selectedUser && (
        <ChatScreen
          currentUser={currentUser}
          token={token}
          otherUser={selectedUser}
          onBack={() => setScreen("home")}
          setError={setError}
        />
      )}
      {screen === "profile" && (
        <ProfileScreen
          userId={selectedUser ? selectedUser.id : token}
          currentUser={currentUser}
          token={token}
          isOwnProfile={!selectedUser || selectedUser.id === token}
          onBack={() => setScreen("home")}
          onLogout={handleLogout}
          setError={setError}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────
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

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setLoc = (field, val) => setForm(f => ({ ...f, location: { ...f.location, [field]: val } }));

  const addKid = () => {
    const age = parseInt(kidAge);
    if (age >= 0 && age <= 12) {
      setForm(f => ({ ...f, kids: [...f.kids, { age, id: Date.now() }] }));
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
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">👨‍👩‍👧‍👦</div>
          <h1 className="text-3xl font-bold text-gray-800">ParentsHub</h1>
          <p className="text-gray-500 text-sm mt-1">Your village, always nearby</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <>
              <input className="input" placeholder="Full Name *" value={form.name} onChange={e => set("name", e.target.value)} required />
              <input className="input" placeholder="Display Name *" value={form.display_name} onChange={e => set("display_name", e.target.value)} required />
              <input className="input" placeholder="Phone Number *" value={form.phone} onChange={e => set("phone", e.target.value)} required />
              <div className="grid grid-cols-3 gap-2">
                <input className="input text-sm" placeholder="City *" value={form.location.city} onChange={e => setLoc("city", e.target.value)} required />
                <input className="input text-sm" placeholder="State *" value={form.location.state} onChange={e => setLoc("state", e.target.value)} required />
                <input className="input text-sm" placeholder="ZIP *" value={form.location.zip} onChange={e => setLoc("zip", e.target.value)} required />
              </div>

              {/* Kids */}
              <div className="border border-gray-300 rounded-lg p-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Kids Ages (0–12) *</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="number" min="0" max="12"
                    className="input flex-1" placeholder="Age"
                    value={kidAge} onChange={e => setKidAge(e.target.value)}
                  />
                  <button type="button" onClick={addKid} className="btn-primary px-4">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.kids.map(k => (
                    <span key={k.id} className="tag flex items-center gap-1">
                      {k.age} yrs
                      <X size={12} className="cursor-pointer" onClick={() => setForm(f => ({ ...f, kids: f.kids.filter(x => x.id !== k.id) }))} />
                    </span>
                  ))}
                </div>
              </div>

              {/* ID Verification */}
              <label className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg cursor-pointer">
                <input type="checkbox" checked={form.id_verified} onChange={e => set("id_verified", e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-gray-700">I confirm I have a valid government-issued ID *</span>
              </label>
            </>
          )}

          <input className="input" type="email" placeholder="Email *" value={form.email} onChange={e => set("email", e.target.value)} required />
          <input className="input" type="password" placeholder="Password *" value={form.password} onChange={e => set("password", e.target.value)} required />

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? "Please wait..." : isSignup ? "Create Account" : "Login"}
          </button>
        </form>

        <div className="text-center mt-6">
          <button onClick={() => setIsSignup(!isSignup)} className="text-purple-600 text-sm font-medium hover:underline">
            {isSignup ? "Already have an account? Login" : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────
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

  // Poll for new posts every 15s
  useEffect(() => {
    const id = setInterval(fetchPosts, 15000);
    return () => clearInterval(id);
  }, [radius]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold">ParentsHub</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("notifications")} className="relative p-2 hover:bg-white/20 rounded-lg">
              <Bell size={24} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => navigate("profile")} className="text-3xl">{currentUser.profile_picture}</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Filter size={14} />
          <span>Radius:</span>
          <select
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            className="bg-white/20 px-2 py-1 rounded text-white border-none outline-none"
          >
            {[10, 20, 30, 50].map(r => <option key={r} value={r}>{r} miles</option>)}
          </select>
        </div>
      </div>

      {/* Feed */}
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={48} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No nearby requests yet</p>
            <p className="text-sm mt-1">Be the first to post!</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onClick={() => navigate("postDetail", post)}
            />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate("newPost")}
        className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
      >
        <Plus size={28} />
      </button>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-3 max-w-md mx-auto">
        <NavBtn icon={<Users size={22} />} label="Feed" active />
        <NavBtn icon={<Bell size={22} />} label="Alerts" onClick={() => navigate("notifications")} badge={unreadCount} />
        <NavBtn icon={<Award size={22} />} label="Profile" onClick={() => navigate("profile")} />
      </div>
    </div>
  );
}

function NavBtn({ icon, label, onClick, active, badge }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 relative ${active ? "text-purple-600" : "text-gray-500"}`}>
      {icon}
      <span className="text-xs">{label}</span>
      {badge > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">{badge}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────
// POST CARD
// ─────────────────────────────────────────────
function PostCard({ post, onClick }) {
  const hoursLeft = Math.max(0, Math.floor((post.expires_at - Date.now()) / 3600000));

  const priorityStyle = {
    "Emergency Medical": "bg-red-100 text-red-700 border-red-300",
    "Important":         "bg-orange-100 text-orange-700 border-orange-300",
    "General":           "bg-blue-100 text-blue-700 border-blue-300",
  };
  const priorityIcon = {
    "Emergency Medical": <AlertCircle size={14} />,
    "Important":         <Info size={14} />,
    "General":           <MessageSquare size={14} />,
  };

  return (
    <div onClick={onClick} className="bg-white rounded-xl shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow">
      {/* Author */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{post.author.profile_picture}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{post.author.display_name}</span>
            <span className="text-xs text-gray-500">{post.author.location.city}, {post.author.location.state}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
            <MapPin size={11} />{post.radius} mi radius
            <span>•</span>
            <span>{hoursLeft}h left</span>
          </div>
        </div>
      </div>

      {/* Priority badge */}
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border mb-3 ${priorityStyle[post.priority]}`}>
        {priorityIcon[post.priority]}{post.priority}
      </span>

      <p className="text-gray-800 mb-3 text-sm leading-relaxed">{post.content}</p>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {post.tags.map((t, i) => <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">#{t}</span>)}
        </div>
      )}

      {/* Age range */}
      {post.age_range && (
        <p className="text-xs text-gray-500 mb-3">👶 For kids ages {post.age_range[0]}–{post.age_range[1]}</p>
      )}

      {/* Completed */}
      {post.completed && (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg mb-3">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span className="text-xs text-green-800 font-semibold">
            Completed · Kudos to @{post.kudos?.display_name}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-gray-400 pt-3 border-t">
        <span className="flex items-center gap-1"><MessageSquare size={14} />{post.comments?.length || 0}</span>
        <span className="flex items-center gap-1"><Share2 size={14} />{post.shares || 0}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NEW POST SCREEN
// ─────────────────────────────────────────────
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
      await api.post(`/posts?user_id=${token}`, {
        ...form,
        age_range: useAge ? [ageMin, ageMax] : null,
      });
      onPosted();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-500 font-medium">Cancel</button>
        <h2 className="font-bold text-lg">New Request</h2>
        <button onClick={handlePost} disabled={loading} className="text-purple-600 font-semibold disabled:opacity-50">
          {loading ? "Posting..." : "Post"}
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Content */}
        <div>
          <label className="label">What do you need? *</label>
          <textarea
            className="input resize-none"
            rows={5}
            placeholder="e.g. Need children's Tylenol urgently in Honolulu. My son has a fever..."
            value={form.content}
            onChange={e => set("content", e.target.value)}
          />
        </div>

        {/* Priority */}
        <div>
          <label className="label">Priority Level *</label>
          <div className="space-y-2">
            {[
              ["Emergency Medical", "Urgent health-related needs"],
              ["Important", "Time-sensitive but not emergency"],
              ["General", "Regular questions or offers"],
            ].map(([p, desc]) => (
              <button
                key={p} type="button"
                onClick={() => set("priority", p)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${form.priority === p ? "border-purple-600 bg-purple-50" : "border-gray-300 bg-white"}`}
              >
                <div className="font-semibold text-sm">{p}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Radius */}
        <div>
          <label className="label">Search Radius</label>
          <div className="flex gap-2">
            {[10, 20, 30, 50].map(r => (
              <button
                key={r} type="button"
                onClick={() => set("radius", r)}
                className={`flex-1 py-2 rounded-lg border-2 font-semibold text-sm transition ${form.radius === r ? "border-purple-600 bg-purple-600 text-white" : "border-gray-300 bg-white text-gray-700"}`}
              >
                {r}mi
              </button>
            ))}
          </div>
        </div>

        {/* Age filter */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={useAge} onChange={e => setUseAge(e.target.checked)} className="w-4 h-4" />
            <span className="label mb-0">Filter by kid age (optional)</span>
          </label>
          {useAge && (
            <div className="flex gap-3 pl-6">
              <div className="flex-1">
                <label className="text-xs text-gray-500">Min Age</label>
                <input type="number" min="0" max="12" className="input" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">Max Age</label>
                <input type="number" min="0" max="12" className="input" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="label">Tags (optional)</label>
          <div className="flex gap-2 mb-2">
            <input className="input flex-1" placeholder="Medicine, Toys, Babysitting..." value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTag()} />
            <button type="button" onClick={addTag} className="btn-primary px-4">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.tags.map((t, i) => (
              <span key={i} className="tag flex items-center gap-1">
                #{t}
                <X size={12} className="cursor-pointer" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))} />
              </span>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          📍 Visible to parents within <strong>{form.radius} miles</strong> for <strong>24 hours</strong>
          {useAge && `. Only parents with kids ages ${ageMin}–${ageMax} notified.`}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// POST DETAIL SCREEN
// ─────────────────────────────────────────────
function PostDetailScreen({ postId, token, currentUser, onBack, onMessageUser, setError }) {
  const [post, setPost] = useState(null);
  const [comment, setComment] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [kudosUserId, setKudosUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = async () => {
    try {
      const data = await api.get(`/posts/${postId}`);
      setPost(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPost(); }, [postId]);

  const handleComment = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/posts/${postId}/comments`, { author_id: token, content: comment });
      setComment("");
      fetchPost();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleShare = async () => {
    try {
      await api.post(`/posts/${postId}/share?user_id=${token}`, {});
      fetchPost();
      alert("Post shared!");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleComplete = async () => {
    if (!kudosUserId) { setError("Please select who to give Kudos to."); return; }
    try {
      await api.post(`/posts/${postId}/complete?user_id=${token}`, { kudos_user_id: kudosUserId });
      setShowComplete(false);
      fetchPost();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (!post) return null;

  const isAuthor = post.author.id === token;
  const commenters = [...new Map(post.comments.map(c => [c.author.id, c.author])).values()]
    .filter(u => u.id !== token);

  const hoursLeft = Math.max(0, Math.floor((post.expires_at - Date.now()) / 3600000));

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-white border-b p-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack}><X size={24} className="text-gray-600" /></button>
        <h2 className="font-bold text-lg flex-1">Request Details</h2>
        <button onClick={handleShare} className="text-purple-600"><Share2 size={22} /></button>
      </div>

      <div className="p-4 space-y-4">
        <PostCard post={post} onClick={() => {}} />

        {/* Complete button */}
        {isAuthor && !post.completed && (
          <button onClick={() => setShowComplete(true)} className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2">
            <CheckCircle size={20} /> Mark as Completed & Give Kudos
          </button>
        )}

        {/* Comments */}
        <div className="bg-white rounded-xl shadow-md p-4">
          <h3 className="font-bold text-lg mb-4">Comments ({post.comments.length})</h3>

          {post.comments.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">No comments yet. Be the first to help!</p>
            : post.comments.map(c => (
              <div key={c.id} className="flex gap-3 mb-4">
                <span className="text-2xl">{c.author.profile_picture}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{c.author.display_name}</span>
                    <span className="text-xs text-gray-400">{Math.floor((Date.now() - c.created_at) / 60000)}m ago</span>
                  </div>
                  <p className="text-sm text-gray-800">{c.content}</p>
                  {!isAuthor && c.author.id !== token && (
                    <button onClick={() => onMessageUser(c.author)} className="text-xs text-purple-600 mt-1 hover:underline">
                      Message privately
                    </button>
                  )}
                </div>
              </div>
            ))
          }

          {!post.completed && (
            <div className="flex gap-2 pt-4 border-t">
              <input
                className="input flex-1"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Leave a comment..."
                onKeyDown={e => e.key === "Enter" && handleComment()}
              />
              <button onClick={handleComment} className="btn-primary px-4">
                <Send size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Direct message author */}
        {!isAuthor && (
          <button onClick={() => onMessageUser(post.author)} className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2">
            <MessageSquare size={20} /> Message {post.author.display_name}
          </button>
        )}
      </div>

      {/* Complete modal */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold mb-2">Give Kudos 🏆</h3>
            <p className="text-sm text-gray-500 mb-4">Who helped you? They'll receive kudos on their profile.</p>
            {commenters.length === 0
              ? <p className="text-sm text-gray-400 mb-4">No commenters to give kudos to yet.</p>
              : commenters.map(u => (
                <button
                  key={u.id}
                  onClick={() => setKudosUserId(u.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 mb-2 transition ${kudosUserId === u.id ? "border-purple-600 bg-purple-50" : "border-gray-200"}`}
                >
                  <span className="text-2xl">{u.profile_picture}</span>
                  <div className="text-left">
                    <div className="font-semibold text-sm">{u.display_name}</div>
                    <div className="text-xs text-gray-500">{u.location.city}, {u.location.state}</div>
                  </div>
                </button>
              ))
            }
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowComplete(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              <button onClick={handleComplete} className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50" disabled={!kudosUserId}>
                Complete & Give Kudos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// NOTIFICATIONS SCREEN
// ─────────────────────────────────────────────
function NotificationsScreen({ token, onBack, onViewPost, setError }) {
  const [notifs, setNotifs] = useState([]);

  useEffect(() => {
    api.get(`/notifications/${token}`)
      .then(setNotifs)
      .catch(err => setError(err.message));
  }, []);

  const handleClick = async (n) => {
    await api.patch(`/notifications/${n.id}/read`);
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    if (n.post_id) onViewPost({ id: n.post_id });
  };

  const typeIcon = { new_post: <Bell size={20} />, comment: <MessageSquare size={20} />, share: <Share2 size={20} />, kudos: <Award size={20} />, message: <Send size={20} /> };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b p-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack}><X size={24} className="text-gray-600" /></button>
        <h2 className="font-bold text-lg">Notifications</h2>
      </div>
      <div className="p-4 space-y-2">
        {notifs.length === 0
          ? <div className="text-center py-16 text-gray-400"><Bell size={48} className="mx-auto mb-3 opacity-30" /><p>No notifications yet</p></div>
          : notifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`p-4 rounded-lg cursor-pointer flex gap-3 transition ${n.read ? "bg-white" : "bg-purple-50 border-2 border-purple-200"}`}
            >
              <div className={n.read ? "text-gray-400" : "text-purple-600"}>{typeIcon[n.type]}</div>
              <div className="flex-1">
                <p className={`text-sm ${n.read ? "text-gray-600" : "text-gray-900 font-semibold"}`}>{n.content}</p>
                <p className="text-xs text-gray-400 mt-1">{Math.floor((Date.now() - n.created_at) / 60000)}m ago</p>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CHAT SCREEN
// ─────────────────────────────────────────────
function ChatScreen({ currentUser, token, otherUser, onBack, setError }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const fetchMsgs = async () => {
    try {
      const data = await api.get(`/messages/${token}/${otherUser.id}`);
      setMsgs(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { fetchMsgs(); }, []);
  useEffect(() => { const id = setInterval(fetchMsgs, 5000); return () => clearInterval(id); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const handleSend = async () => {
    if (!text.trim()) return;
    try {
      await api.post("/messages", { from_id: token, to_id: otherUser.id, content: text });
      setText("");
      fetchMsgs();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b p-4 flex items-center gap-3">
        <button onClick={onBack}><X size={24} className="text-gray-600" /></button>
        <span className="text-2xl">{otherUser.profile_picture}</span>
        <div>
          <p className="font-bold">{otherUser.display_name}</p>
          <p className="text-xs text-gray-500">{otherUser.location?.city}, {otherUser.location?.state}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <p className="text-center text-gray-400 text-sm mt-10">No messages yet. Say hello!</p>}
        {msgs.map(m => {
          const isOwn = m.from_id === token;
          return (
            <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${isOwn ? "bg-purple-600 text-white rounded-br-none" : "bg-white text-gray-800 rounded-bl-none shadow"}`}>
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

      <div className="bg-white border-t p-4">
        <div className="flex gap-2">
          <input
            className="input flex-1 rounded-full"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={e => e.key === "Enter" && handleSend()}
          />
          <button onClick={handleSend} className="btn-primary w-12 h-12 rounded-full flex items-center justify-center">
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PROFILE SCREEN
// ─────────────────────────────────────────────
function ProfileScreen({ userId, currentUser, token, isOwnProfile, onBack, onLogout, setError }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get(`/users/${userId}`),
      api.get(`/posts?user_id=${userId}&radius=9999`),
    ])
      .then(([u, p]) => {
        setUser(u);
        setPosts(p.filter(post => post.author.id === userId));
      })
      .catch(err => setError(err.message));
  }, [userId]);

  if (!user) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading profile...</div>;

  const completedPosts = posts.filter(p => p.completed);
  const kudosPosts = completedPosts.filter(p => p.kudos?.id === userId);

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4">
        <div className="flex justify-between mb-4">
          <button onClick={onBack}><X size={24} /></button>
          {isOwnProfile && (
            <button onClick={onLogout} className="bg-white/20 px-4 py-1.5 rounded-lg text-sm hover:bg-white/30">Logout</button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-6xl">{user.profile_picture}</span>
          <div>
            <h2 className="text-2xl font-bold">{user.display_name}</h2>
            <p className="text-sm opacity-80">📍 {user.location.city}, {user.location.state}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star size={14} fill="gold" color="gold" />
              <span className="font-semibold">{user.trust_score.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Posts", posts.length, "purple"],
            ["Completed", completedPosts.length, "green"],
            ["Kudos", user.kudos_count, "orange"],
          ].map(([label, val, color]) => (
            <div key={label} className="bg-white rounded-lg p-4 text-center shadow">
              <div className={`text-2xl font-bold text-${color}-600`}>{val}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Kids */}
        <div className="bg-white rounded-xl shadow-md p-4">
          <h3 className="font-bold text-lg mb-3">👶 Kids</h3>
          <div className="flex flex-wrap gap-2">
            {user.kids.map((kid, i) => (
              <span key={i} className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full font-semibold text-sm">
                {kid.age} years old
              </span>
            ))}
          </div>
        </div>

        {/* Kudos section */}
        <div className="bg-white rounded-xl shadow-md p-4">
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Award className="text-orange-500" size={22} /> Kudos Received
          </h3>
          {kudosPosts.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">No kudos yet</p>
            : kudosPosts.map(p => (
              <div key={p.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg mb-2">
                <p className="text-sm text-gray-800 mb-1">{p.content.substring(0, 80)}...</p>
                <p className="text-xs text-orange-700 font-semibold">From @{p.author.display_name}</p>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
