from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from contextlib import contextmanager
import uuid
import time
import httpx
import psycopg2
import psycopg2.extras
import psycopg2.pool
import os
import json

app = FastAPI(title="ParentsHub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────

DB_URL = os.getenv("DATABASE_URL", f"postgresql://{os.getenv('USER', 'postgres')}@localhost/parentshub")
_pool: psycopg2.pool.ThreadedConnectionPool = None

MILES_TO_METERS = 1609.34


def get_pool():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            1, 10, DB_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    return _pool


@contextmanager
def get_db():
    conn = get_pool().getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        get_pool().putconn(conn)


def init_db():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id          UUID PRIMARY KEY,
                    name        TEXT NOT NULL,
                    email       TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    password    TEXT NOT NULL,
                    phone       TEXT DEFAULT '',
                    profile_picture TEXT DEFAULT '👤',
                    address     TEXT DEFAULT '',
                    city        TEXT NOT NULL,
                    state       TEXT NOT NULL,
                    zip         TEXT NOT NULL,
                    location    GEOMETRY(POINT, 4326),
                    kids        JSONB DEFAULT '[]',
                    trust_score FLOAT DEFAULT 5.0,
                    kudos_count INT DEFAULT 0,
                    created_at  BIGINT NOT NULL,
                    last_active_at BIGINT NOT NULL DEFAULT 0
                );
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS users_location_gist ON users USING GIST(location);"
            )
            cur.execute("""
                CREATE TABLE IF NOT EXISTS posts (
                    id          UUID PRIMARY KEY,
                    author_id   UUID NOT NULL REFERENCES users(id),
                    content     TEXT NOT NULL,
                    priority    TEXT NOT NULL,
                    radius      INT NOT NULL,
                    tags        JSONB DEFAULT '[]',
                    age_range   JSONB,
                    comments    JSONB DEFAULT '[]',
                    shares      INT DEFAULT 0,
                    completed   BOOLEAN DEFAULT FALSE,
                    kudos_user_id UUID REFERENCES users(id),
                    kudos_stars INT,
                    created_at  BIGINT NOT NULL,
                    expires_at  BIGINT NOT NULL
                );
            """)
            cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS kudos_stars INT;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at BIGINT NOT NULL DEFAULT 0;")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id         UUID PRIMARY KEY,
                    from_id    UUID NOT NULL REFERENCES users(id),
                    to_id      UUID NOT NULL REFERENCES users(id),
                    content    TEXT NOT NULL,
                    created_at BIGINT NOT NULL
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id         UUID PRIMARY KEY,
                    user_id    UUID NOT NULL REFERENCES users(id),
                    type       TEXT NOT NULL,
                    content    TEXT NOT NULL,
                    post_id    UUID,
                    created_at BIGINT NOT NULL,
                    read       BOOLEAN DEFAULT FALSE
                );
            """)


@app.on_event("startup")
def startup():
    init_db()


# ─────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────

class Kid(BaseModel):
    age: int

class Location(BaseModel):
    address: str = ""
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
    id_verified: bool = False
    location: Location
    kids: List[Kid]

class LoginRequest(BaseModel):
    email: str
    password: str

class PostRequest(BaseModel):
    content: str
    priority: str
    radius: int
    tags: List[str] = []
    age_range: Optional[List[int]] = None

class CommentRequest(BaseModel):
    author_id: str
    content: str

class CompleteRequest(BaseModel):
    kudos_user_id: Optional[str] = None
    stars: int = 5  # 1–5 star rating

class EditPostRequest(BaseModel):
    content: str
    priority: str
    radius: int
    tags: List[str] = []
    age_range: Optional[List[int]] = None

class MessageRequest(BaseModel):
    from_id: str
    to_id: str
    content: str

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def make_id() -> str:
    return str(uuid.uuid4())

def now_ts() -> int:
    return int(time.time() * 1000)

# Explicit aliases avoid p.id / u.id column collision in RealDictCursor JOIN results
POST_COLUMNS = """
    p.id            AS post_id,
    p.author_id,
    p.content, p.priority, p.radius, p.tags, p.age_range,
    p.comments, p.shares, p.completed, p.kudos_user_id,
    p.created_at    AS post_created_at,
    p.expires_at,
    u.id            AS author_user_id,
    u.display_name, u.profile_picture, u.city, u.state,
    u.kids, u.trust_score, u.kudos_count,
    ku.id               AS kudos_id,
    ku.display_name     AS kudos_display_name,
    ku.profile_picture  AS kudos_profile_picture,
    ku.city             AS kudos_city,
    ku.state            AS kudos_state,
    ku.kids             AS kudos_kids,
    ku.trust_score      AS kudos_trust,
    ku.kudos_count      AS kudos_kudos_count
"""

def geocode_zip(zip_code: str) -> Optional[tuple]:
    """Returns (lat, lng) from zippopotam.us or None."""
    try:
        with httpx.Client(timeout=5) as client:
            res = client.get(f"https://api.zippopotam.us/us/{zip_code}")
            if res.status_code == 200:
                place = res.json()["places"][0]
                return float(place["latitude"]), float(place["longitude"])
    except Exception:
        pass
    return None

def _parse_json(val, default):
    if val is None: return default
    return val if isinstance(val, (list, dict)) else json.loads(val)

def row_to_user_public(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "display_name": row["display_name"],
        "profile_picture": row["profile_picture"],
        "location": {"city": row["city"], "state": row["state"]},
        "kids": _parse_json(row["kids"], []),
        "trust_score": row["trust_score"],
        "kudos_count": row["kudos_count"],
    }

def row_to_post(row: dict) -> dict:
    """Convert a POST_COLUMNS JOIN row into a post dict."""
    kudos = None
    if row.get("kudos_id"):
        kudos = {
            "id": str(row["kudos_id"]),
            "display_name": row["kudos_display_name"],
            "profile_picture": row["kudos_profile_picture"],
            "location": {"city": row["kudos_city"], "state": row["kudos_state"]},
            "kids": _parse_json(row["kudos_kids"], []),
            "trust_score": row["kudos_trust"],
            "kudos_count": row["kudos_kudos_count"],
        }
    return {
        "id": str(row["post_id"]),
        "author": {
            "id": str(row["author_user_id"]),
            "display_name": row["display_name"],
            "profile_picture": row["profile_picture"],
            "location": {"city": row["city"], "state": row["state"]},
            "kids": _parse_json(row["kids"], []),
            "trust_score": row["trust_score"],
            "kudos_count": row["kudos_count"],
        },
        "content": row["content"],
        "priority": row["priority"],
        "radius": row["radius"],
        "tags": _parse_json(row["tags"], []),
        "age_range": _parse_json(row["age_range"], None),
        "comments": _parse_json(row["comments"], []),
        "shares": row["shares"],
        "completed": row["completed"],
        "kudos": kudos,
        "created_at": row["post_created_at"],
        "expires_at": row["expires_at"],
    }

def touch_active(cur, user_id: str):
    cur.execute("UPDATE users SET last_active_at = %s WHERE id = %s", (now_ts(), user_id))

def add_notification(cur, user_id: str, type: str, content: str, post_id: Optional[str] = None):
    cur.execute(
        """INSERT INTO notifications (id, user_id, type, content, post_id, created_at, read)
           VALUES (%s, %s, %s, %s, %s, %s, FALSE)""",
        (make_id(), user_id, type, content, post_id, now_ts()),
    )

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.post("/auth/register")
def register(req: RegisterRequest):
    coords = geocode_zip(req.location.zip)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE email = %s", (req.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered.")

            user_id = make_id()
            if coords:
                lat, lng = coords
                cur.execute(
                    """INSERT INTO users
                       (id, name, email, display_name, password, phone, profile_picture,
                        address, city, state, zip, location, kids, trust_score, kudos_count, created_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                               ST_SetSRID(ST_MakePoint(%s,%s),4326),
                               %s,%s,%s,%s)""",
                    (user_id, req.name, req.email, req.display_name, req.password,
                     req.phone, req.profile_picture, req.location.address,
                     req.location.city, req.location.state, req.location.zip,
                     lng, lat,
                     json.dumps([k.dict() for k in req.kids]),
                     5.0, 0, now_ts()),
                )
            else:
                cur.execute(
                    """INSERT INTO users
                       (id, name, email, display_name, password, phone, profile_picture,
                        address, city, state, zip, kids, trust_score, kudos_count, created_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (user_id, req.name, req.email, req.display_name, req.password,
                     req.phone, req.profile_picture, req.location.address,
                     req.location.city, req.location.state, req.location.zip,
                     json.dumps([k.dict() for k in req.kids]),
                     5.0, 0, now_ts()),
                )

            touch_active(cur, user_id)
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()

    return {"user": row_to_user_public(user), "token": user_id}


@app.post("/auth/login")
def login(req: LoginRequest):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM users WHERE email = %s AND password = %s",
                (req.email, req.password),
            )
            user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    with get_db() as conn:
        with conn.cursor() as cur:
            touch_active(cur, str(user["id"]))
    return {"user": row_to_user_public(user), "token": str(user["id"])}


@app.get("/users/{user_id}")
def get_user(user_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return row_to_user_public(user)

# ─────────────────────────────────────────────
# POST ROUTES
# ─────────────────────────────────────────────

@app.get("/posts")
def get_posts(user_id: str, radius: int = 50, lat: Optional[float] = None, lng: Optional[float] = None):
    now = now_ts()
    radius_m = radius * MILES_TO_METERS

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            requester = cur.fetchone()
            if not requester:
                raise HTTPException(status_code=404, detail="User not found.")

            # Use live GPS coords if provided, otherwise fall back to stored location
            if lat is not None and lng is not None:
                origin = f"ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)"
                cur.execute(
                    f"SELECT {POST_COLUMNS} FROM posts p"
                    " JOIN users u ON p.author_id = u.id"
                    " LEFT JOIN users ku ON p.kudos_user_id = ku.id"
                    f" WHERE p.expires_at > %s"
                    f"   AND (u.location IS NULL OR ST_DWithin(geography(u.location), geography({origin}), %s))"
                    " ORDER BY p.created_at DESC",
                    (now, radius_m),
                )
            elif requester["location"] is not None:
                cur.execute(
                    f"SELECT {POST_COLUMNS} FROM posts p"
                    " JOIN users u ON p.author_id = u.id"
                    " LEFT JOIN users ku ON p.kudos_user_id = ku.id"
                    " WHERE p.expires_at > %s"
                    "   AND (u.location IS NULL OR ST_DWithin("
                    "         geography(u.location), geography(%s::geometry), %s))"
                    " ORDER BY p.created_at DESC",
                    (now, requester["location"], radius_m),
                )
            else:
                cur.execute(
                    f"SELECT {POST_COLUMNS} FROM posts p"
                    " JOIN users u ON p.author_id = u.id"
                    " LEFT JOIN users ku ON p.kudos_user_id = ku.id"
                    " WHERE p.expires_at > %s ORDER BY p.created_at DESC",
                    (now,),
                )
            rows = cur.fetchall()

    return [row_to_post(row) for row in rows]


@app.post("/posts")
def create_post(user_id: str, req: PostRequest):
    now = now_ts()
    radius_m = req.radius * MILES_TO_METERS

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            author = cur.fetchone()
            if not author:
                raise HTTPException(status_code=404, detail="User not found.")

            touch_active(cur, user_id)
            post_id = make_id()
            cur.execute(
                """INSERT INTO posts
                   (id, author_id, content, priority, radius, tags, age_range,
                    comments, shares, completed, created_at, expires_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'[]',0,FALSE,%s,%s)""",
                (post_id, user_id, req.content, req.priority, req.radius,
                 json.dumps(req.tags),
                 json.dumps(req.age_range) if req.age_range else None,
                 now, now + 24 * 60 * 60 * 1000),
            )

            # Notify nearby users via PostGIS
            if author["location"] is not None:
                cur.execute(
                    """SELECT id, display_name, kids FROM users
                       WHERE id != %s
                         AND location IS NOT NULL
                         AND ST_DWithin(
                               geography(location),
                               geography(%s::geometry),
                               %s
                             )""",
                    (user_id, author["location"], radius_m),
                )
            else:
                cur.execute(
                    "SELECT id, display_name, kids FROM users WHERE id != %s",
                    (user_id,),
                )

            nearby = cur.fetchall()
            for u in nearby:
                kids = u["kids"] if isinstance(u["kids"], list) else json.loads(u["kids"] or "[]")
                if req.age_range:
                    if not any(req.age_range[0] <= k["age"] <= req.age_range[1] for k in kids):
                        continue
                add_notification(
                    cur, str(u["id"]),
                    "new_post",
                    f"New {req.priority} request nearby: {req.content[:60]}...",
                    post_id,
                )

            cur.execute(
                f"SELECT {POST_COLUMNS} FROM posts p"
                " JOIN users u ON p.author_id = u.id"
                " LEFT JOIN users ku ON p.kudos_user_id = ku.id"
                " WHERE p.id = %s",
                (post_id,),
            )
            row = cur.fetchone()

    return row_to_post(row)


def _fetch_post(cur, post_id: str):
    cur.execute(
        f"SELECT {POST_COLUMNS} FROM posts p"
        " JOIN users u ON p.author_id = u.id"
        " LEFT JOIN users ku ON p.kudos_user_id = ku.id"
        " WHERE p.id = %s",
        (post_id,),
    )
    return cur.fetchone()

@app.get("/posts/{post_id}")
def get_post(post_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            row = _fetch_post(cur, post_id)
    if not row:
        raise HTTPException(status_code=404, detail="Post not found.")
    return row_to_post(row)


@app.patch("/posts/{post_id}")
def edit_post(post_id: str, user_id: str, req: EditPostRequest):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_id, completed FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            if not post:
                raise HTTPException(status_code=404, detail="Post not found.")
            if str(post["author_id"]) != user_id:
                raise HTTPException(status_code=403, detail="Only the author can edit this post.")
            if post["completed"]:
                raise HTTPException(status_code=400, detail="Cannot edit a completed post.")
            cur.execute(
                """UPDATE posts SET content=%s, priority=%s, radius=%s, tags=%s, age_range=%s
                   WHERE id=%s""",
                (req.content, req.priority, req.radius,
                 json.dumps(req.tags),
                 json.dumps(req.age_range) if req.age_range else None,
                 post_id),
            )
            row = _fetch_post(cur, post_id)
    return row_to_post(row)


@app.delete("/posts/{post_id}")
def delete_post(post_id: str, user_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_id FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            if not post:
                raise HTTPException(status_code=404, detail="Post not found.")
            if str(post["author_id"]) != user_id:
                raise HTTPException(status_code=403, detail="Only the author can delete this post.")
            cur.execute("DELETE FROM notifications WHERE post_id = %s", (post_id,))
            cur.execute("DELETE FROM posts WHERE id = %s", (post_id,))
    return {"deleted": True}


@app.post("/posts/{post_id}/comments")
def add_comment(post_id: str, req: CommentRequest):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            if not post:
                raise HTTPException(status_code=404, detail="Post not found.")
            if post["completed"]:
                raise HTTPException(status_code=400, detail="Cannot comment on a completed post.")

            cur.execute("SELECT * FROM users WHERE id = %s", (req.author_id,))
            author = cur.fetchone()
            if not author:
                raise HTTPException(status_code=404, detail="User not found.")

            comment = {
                "id": make_id(),
                "author": row_to_user_public(author),
                "content": req.content,
                "created_at": now_ts(),
            }
            existing = post["comments"] if isinstance(post["comments"], list) else json.loads(post["comments"] or "[]")
            existing.append(comment)
            cur.execute(
                "UPDATE posts SET comments = %s WHERE id = %s",
                (json.dumps(existing), post_id),
            )

            if str(post["author_id"]) != req.author_id:
                add_notification(
                    cur, str(post["author_id"]),
                    "comment",
                    f"{author['display_name']} commented on your post.",
                    post_id,
                )
    return comment


@app.post("/posts/{post_id}/share")
def share_post(post_id: str, user_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            if not post:
                raise HTTPException(status_code=404, detail="Post not found.")

            cur.execute("UPDATE posts SET shares = shares + 1 WHERE id = %s RETURNING shares", (post_id,))
            new_shares = cur.fetchone()["shares"]

            cur.execute("SELECT display_name FROM users WHERE id = %s", (user_id,))
            sharer = cur.fetchone()
            if sharer and str(post["author_id"]) != user_id:
                add_notification(
                    cur, str(post["author_id"]),
                    "share",
                    f"{sharer['display_name']} shared your post.",
                    post_id,
                )
    return {"shares": new_shares}


@app.post("/posts/{post_id}/complete")
def complete_post(post_id: str, user_id: str, req: CompleteRequest):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM posts WHERE id = %s", (post_id,))
            post = cur.fetchone()
            if not post:
                raise HTTPException(status_code=404, detail="Post not found.")
            if str(post["author_id"]) != user_id:
                raise HTTPException(status_code=403, detail="Only the post author can complete a post.")
            if post["completed"]:
                raise HTTPException(status_code=400, detail="Post already completed.")

            stars = max(1, min(5, req.stars))
            cur.execute(
                "UPDATE posts SET completed = TRUE, kudos_user_id = %s, kudos_stars = %s WHERE id = %s",
                (req.kudos_user_id, stars if req.kudos_user_id else None, post_id),
            )

            if req.kudos_user_id:
                cur.execute("SELECT * FROM users WHERE id = %s", (req.kudos_user_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Kudos user not found.")
                cur.execute(
                    "UPDATE users SET kudos_count = kudos_count + 1 WHERE id = %s",
                    (req.kudos_user_id,),
                )
                # Recalculate trust score as average of all received star ratings
                cur.execute(
                    "SELECT ROUND(AVG(kudos_stars)::numeric, 1) AS avg FROM posts WHERE kudos_user_id = %s AND kudos_stars IS NOT NULL",
                    (req.kudos_user_id,),
                )
                avg = cur.fetchone()["avg"]
                if avg is not None:
                    cur.execute("UPDATE users SET trust_score = %s WHERE id = %s", (float(avg), req.kudos_user_id))

                cur.execute("SELECT display_name FROM users WHERE id = %s", (user_id,))
                completer = cur.fetchone()
                add_notification(
                    cur, req.kudos_user_id,
                    "kudos",
                    f"{completer['display_name']} gave you Kudos! 🏆",
                    post_id,
                )

    with get_db() as conn:
        with conn.cursor() as cur:
            row = _fetch_post(cur, post_id)
    return row_to_post(row)

# ─────────────────────────────────────────────
# MESSAGE ROUTES
# ─────────────────────────────────────────────

@app.post("/messages")
def send_message(req: MessageRequest):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT display_name FROM users WHERE id = %s", (req.from_id,))
            sender = cur.fetchone()
            cur.execute("SELECT id FROM users WHERE id = %s", (req.to_id,))
            receiver = cur.fetchone()
            if not sender or not receiver:
                raise HTTPException(status_code=404, detail="User not found.")

            touch_active(cur, req.from_id)
            msg_id = make_id()
            ts = now_ts()
            cur.execute(
                "INSERT INTO messages (id, from_id, to_id, content, created_at) VALUES (%s,%s,%s,%s,%s)",
                (msg_id, req.from_id, req.to_id, req.content, ts),
            )
            add_notification(
                cur, req.to_id,
                "message",
                f"New message from {sender['display_name']}",
            )

    return {"id": msg_id, "from_id": req.from_id, "to_id": req.to_id, "content": req.content, "created_at": ts}


@app.get("/messages/{user_id}/{other_id}")
def get_messages(user_id: str, other_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT * FROM messages
                   WHERE (from_id = %s AND to_id = %s)
                      OR (from_id = %s AND to_id = %s)
                   ORDER BY created_at""",
                (user_id, other_id, other_id, user_id),
            )
            rows = cur.fetchall()
    return [{"id": str(r["id"]), "from_id": str(r["from_id"]), "to_id": str(r["to_id"]),
             "content": r["content"], "created_at": r["created_at"]} for r in rows]

# ─────────────────────────────────────────────
# NOTIFICATION ROUTES
# ─────────────────────────────────────────────

@app.get("/notifications/{user_id}")
def get_notifications(user_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            rows = cur.fetchall()
    return [{"id": str(r["id"]), "user_id": str(r["user_id"]), "type": r["type"],
             "content": r["content"], "post_id": str(r["post_id"]) if r["post_id"] else None,
             "created_at": r["created_at"], "read": r["read"]} for r in rows]


@app.patch("/notifications/{notif_id}/read")
def mark_read(notif_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE notifications SET read = TRUE WHERE id = %s RETURNING *",
                (notif_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"id": str(row["id"]), "read": row["read"]}

# ─────────────────────────────────────────────
# STATS + HEALTH CHECK
# ─────────────────────────────────────────────

@app.get("/stats")
def get_stats(user_id: str, radius: int = 50, lat: Optional[float] = None, lng: Optional[float] = None):
    radius_m = radius * MILES_TO_METERS
    sixty_days_ago = now_ts() - 60 * 24 * 60 * 60 * 1000

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT location FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()

            if lat is not None and lng is not None:
                origin = f"ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)"
                cur.execute(
                    f"""SELECT COUNT(*) AS c FROM users
                        WHERE id != %s AND last_active_at > %s
                          AND location IS NOT NULL
                          AND ST_DWithin(geography(location), geography({origin}), %s)""",
                    (user_id, sixty_days_ago, radius_m),
                )
            elif user and user["location"] is not None:
                cur.execute(
                    """SELECT COUNT(*) AS c FROM users
                       WHERE id != %s AND last_active_at > %s
                         AND location IS NOT NULL
                         AND ST_DWithin(geography(location), geography(%s::geometry), %s)""",
                    (user_id, sixty_days_ago, user["location"], radius_m),
                )
            else:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM users WHERE id != %s AND last_active_at > %s",
                    (user_id, sixty_days_ago),
                )
            active_nearby = cur.fetchone()["c"]

            cur.execute("SELECT COUNT(*) AS c FROM posts WHERE expires_at > %s", (now_ts(),))
            open_posts = cur.fetchone()["c"]

    return {"parents_nearby": active_nearby, "open_posts": open_posts}


@app.get("/")
def root():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as c FROM users")
            users = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) as c FROM posts WHERE expires_at > %s", (now_ts(),))
            posts = cur.fetchone()["c"]
            cur.execute("SELECT COUNT(*) as c FROM messages")
            messages = cur.fetchone()["c"]
    return {"status": "ParentsHub API running", "users": users, "posts": posts, "messages": messages}
