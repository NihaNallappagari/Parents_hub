from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import uuid
import time

app = FastAPI(title="ParentsHub API")

# ─────────────────────────────────────────────
# CORS – allow React dev server
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# IN-MEMORY STORAGE
# ─────────────────────────────────────────────
MAX_USERS = 5

db = {
    "users": {},          # id -> user dict
    "posts": {},          # id -> post dict
    "messages": [],       # list of message dicts
    "notifications": [],  # list of notification dicts
}

# ─────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────

class Kid(BaseModel):
    age: int

class Location(BaseModel):
    city: str
    state: str
    zip: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    display_name: str
    password: str
    phone: str
    profile_picture: str = "👤"
    id_verified: bool
    location: Location
    kids: List[Kid]

class LoginRequest(BaseModel):
    email: str
    password: str

class PostRequest(BaseModel):
    content: str
    priority: str  # "Emergency Medical", "Important", "General"
    radius: int    # 10, 20, 30, 50
    tags: List[str] = []
    age_range: Optional[List[int]] = None  # [min, max] or None

class CommentRequest(BaseModel):
    author_id: str
    content: str

class CompleteRequest(BaseModel):
    kudos_user_id: str

class MessageRequest(BaseModel):
    from_id: str
    to_id: str
    content: str

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def make_id():
    return str(uuid.uuid4())

def now_ts():
    return int(time.time() * 1000)

def user_public(user: dict) -> dict:
    """Return only public fields of a user."""
    return {
        "id": user["id"],
        "display_name": user["display_name"],
        "profile_picture": user["profile_picture"],
        "location": {"city": user["location"]["city"], "state": user["location"]["state"]},
        "kids": user["kids"],          # ages shown publicly
        "trust_score": user["trust_score"],
        "kudos_count": user["kudos_count"],
    }

def add_notification(user_id: str, type: str, content: str, post_id: Optional[str] = None):
    db["notifications"].append({
        "id": make_id(),
        "user_id": user_id,
        "type": type,
        "content": content,
        "post_id": post_id,
        "created_at": now_ts(),
        "read": False,
    })

def zip_distance(zip1: str, zip2: str) -> float:
    """
    Simplified distance simulation based on ZIP codes.
    In production, replace with PostGIS / Google Maps Distance Matrix API.
    """
    try:
        return abs(int(zip1) - int(zip2)) * 0.1
    except ValueError:
        return 0.0

def posts_expired_cleanup():
    """Remove posts older than 24 hours from memory."""
    cutoff = now_ts() - 24 * 60 * 60 * 1000
    expired = [pid for pid, p in db["posts"].items() if p["created_at"] < cutoff]
    for pid in expired:
        del db["posts"][pid]

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.post("/auth/register")
def register(req: RegisterRequest):
    if len(db["users"]) >= MAX_USERS:
        raise HTTPException(status_code=403, detail=f"Max {MAX_USERS} users reached for this demo.")

    # Check duplicate email
    for u in db["users"].values():
        if u["email"] == req.email:
            raise HTTPException(status_code=400, detail="Email already registered.")

    user_id = make_id()
    user = {
        "id": user_id,
        "name": req.name,
        "email": req.email,
        "display_name": req.display_name,
        "password": req.password,          # plain text OK for in-memory demo
        "phone": req.phone,
        "profile_picture": req.profile_picture,
        "id_verified": req.id_verified,
        "location": req.location.dict(),
        "kids": [k.dict() for k in req.kids],
        "trust_score": 5.0,
        "kudos_count": 0,
        "created_at": now_ts(),
    }
    db["users"][user_id] = user
    return {"user": user_public(user), "token": user_id}   # token = user_id for simplicity


@app.post("/auth/login")
def login(req: LoginRequest):
    for u in db["users"].values():
        if u["email"] == req.email and u["password"] == req.password:
            return {"user": user_public(u), "token": u["id"]}
    raise HTTPException(status_code=401, detail="Invalid email or password.")


@app.get("/users/{user_id}")
def get_user(user_id: str):
    user = db["users"].get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user_public(user)

# ─────────────────────────────────────────────
# POST ROUTES
# ─────────────────────────────────────────────

@app.get("/posts")
def get_posts(user_id: str, radius: int = 50):
    """Return nearby posts (within radius) sorted newest first, excluding expired."""
    posts_expired_cleanup()

    requesting_user = db["users"].get(user_id)
    if not requesting_user:
        raise HTTPException(status_code=404, detail="User not found.")

    user_zip = requesting_user["location"]["zip"]
    result = []
    for post in db["posts"].values():
        dist = zip_distance(post["author"]["location"]["zip"], user_zip)
        if dist <= radius:
            result.append(post)

    result.sort(key=lambda p: p["created_at"], reverse=True)
    return result


@app.post("/posts")
def create_post(user_id: str, req: PostRequest):
    posts_expired_cleanup()

    author = db["users"].get(user_id)
    if not author:
        raise HTTPException(status_code=404, detail="User not found.")

    post_id = make_id()
    post = {
        "id": post_id,
        "author": user_public(author),
        "content": req.content,
        "priority": req.priority,
        "radius": req.radius,
        "tags": req.tags,
        "age_range": req.age_range,
        "created_at": now_ts(),
        "expires_at": now_ts() + 24 * 60 * 60 * 1000,
        "comments": [],
        "shares": 0,
        "completed": False,
        "kudos": None,
    }
    db["posts"][post_id] = post

    # Notify matching users within radius
    author_zip = author["location"]["zip"]
    for uid, user in db["users"].items():
        if uid == user_id:
            continue
        dist = zip_distance(user["location"]["zip"], author_zip)
        if dist > req.radius:
            continue
        # Age range filter
        if req.age_range:
            has_match = any(
                req.age_range[0] <= kid["age"] <= req.age_range[1]
                for kid in user["kids"]
            )
            if not has_match:
                continue
        add_notification(
            uid,
            "new_post",
            f"New {req.priority} request nearby: {req.content[:60]}...",
            post_id,
        )

    return post


@app.get("/posts/{post_id}")
def get_post(post_id: str):
    post = db["posts"].get(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    return post


@app.post("/posts/{post_id}/comments")
def add_comment(post_id: str, req: CommentRequest):
    post = db["posts"].get(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post["completed"]:
        raise HTTPException(status_code=400, detail="Cannot comment on a completed post.")

    author = db["users"].get(req.author_id)
    if not author:
        raise HTTPException(status_code=404, detail="User not found.")

    comment = {
        "id": make_id(),
        "author": user_public(author),
        "content": req.content,
        "created_at": now_ts(),
    }
    db["posts"][post_id]["comments"].append(comment)

    # Notify post author
    if post["author"]["id"] != req.author_id:
        add_notification(
            post["author"]["id"],
            "comment",
            f"{author['display_name']} commented on your post.",
            post_id,
        )

    return comment


@app.post("/posts/{post_id}/share")
def share_post(post_id: str, user_id: str):
    post = db["posts"].get(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    db["posts"][post_id]["shares"] += 1

    # Notify post author
    sharer = db["users"].get(user_id)
    if sharer and post["author"]["id"] != user_id:
        add_notification(
            post["author"]["id"],
            "share",
            f"{sharer['display_name']} shared your post.",
            post_id,
        )

    return {"shares": db["posts"][post_id]["shares"]}


@app.post("/posts/{post_id}/complete")
def complete_post(post_id: str, user_id: str, req: CompleteRequest):
    post = db["posts"].get(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post["author"]["id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the post author can complete a post.")
    if post["completed"]:
        raise HTTPException(status_code=400, detail="Post already completed.")

    kudos_user = db["users"].get(req.kudos_user_id)
    if not kudos_user:
        raise HTTPException(status_code=404, detail="Kudos user not found.")

    db["posts"][post_id]["completed"] = True
    db["posts"][post_id]["kudos"] = user_public(kudos_user)

    # Update kudos count on recipient
    db["users"][req.kudos_user_id]["kudos_count"] += 1

    # Notify kudos recipient
    add_notification(
        req.kudos_user_id,
        "kudos",
        f"{db['users'][user_id]['display_name']} gave you Kudos! 🏆",
        post_id,
    )

    return db["posts"][post_id]

# ─────────────────────────────────────────────
# MESSAGE ROUTES
# ─────────────────────────────────────────────

@app.post("/messages")
def send_message(req: MessageRequest):
    sender = db["users"].get(req.from_id)
    receiver = db["users"].get(req.to_id)
    if not sender or not receiver:
        raise HTTPException(status_code=404, detail="User not found.")

    message = {
        "id": make_id(),
        "from_id": req.from_id,
        "to_id": req.to_id,
        "content": req.content,
        "created_at": now_ts(),
    }
    db["messages"].append(message)

    # Notify recipient
    add_notification(
        req.to_id,
        "message",
        f"New message from {sender['display_name']}",
    )

    return message


@app.get("/messages/{user_id}/{other_id}")
def get_messages(user_id: str, other_id: str):
    chat = [
        m for m in db["messages"]
        if (m["from_id"] == user_id and m["to_id"] == other_id)
        or (m["from_id"] == other_id and m["to_id"] == user_id)
    ]
    chat.sort(key=lambda m: m["created_at"])
    return chat

# ─────────────────────────────────────────────
# NOTIFICATION ROUTES
# ─────────────────────────────────────────────

@app.get("/notifications/{user_id}")
def get_notifications(user_id: str):
    notifs = [n for n in db["notifications"] if n["user_id"] == user_id]
    notifs.sort(key=lambda n: n["created_at"], reverse=True)
    return notifs


@app.patch("/notifications/{notif_id}/read")
def mark_read(notif_id: str):
    for n in db["notifications"]:
        if n["id"] == notif_id:
            n["read"] = True
            return n
    raise HTTPException(status_code=404, detail="Notification not found.")

# ─────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "ParentsHub API running",
        "users": len(db["users"]),
        "max_users": MAX_USERS,
        "posts": len(db["posts"]),
        "messages": len(db["messages"]),
    }
