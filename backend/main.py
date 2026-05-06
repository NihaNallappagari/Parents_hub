from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
import uuid
import time

from database import engine, get_db, Base
from models import (
    User as DBUser,
    Kid as DBKid,
    Post as DBPost,
    Comment as DBComment,
    Message as DBMessage,
    Notification as DBNotification,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ParentsHub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_USERS = 5

# ─────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────

class KidInput(BaseModel):
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
    kids: List[KidInput]

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

def zip_distance(zip1: str, zip2: str) -> float:
    """
    Simplified distance simulation based on ZIP codes.
    In production, replace with PostGIS / Google Maps Distance Matrix API.
    """
    try:
        return abs(int(zip1) - int(zip2)) * 0.1
    except ValueError:
        return 0.0

def user_public(user: DBUser) -> dict:
    return {
        "id": user.id,
        "display_name": user.display_name,
        "profile_picture": user.profile_picture,
        "location": {"city": user.city, "state": user.state},
        "kids": [{"age": k.age} for k in user.kids],
        "trust_score": user.trust_score,
        "kudos_count": user.kudos_count,
    }

def post_to_dict(post: DBPost) -> dict:
    return {
        "id": post.id,
        "author": user_public(post.author),
        "content": post.content,
        "priority": post.priority,
        "radius": post.radius,
        "tags": post.tags or [],
        "age_range": [post.age_range_min, post.age_range_max] if post.age_range_min is not None else None,
        "created_at": post.created_at,
        "expires_at": post.expires_at,
        "comments": [comment_to_dict(c) for c in post.comments],
        "shares": post.shares,
        "completed": post.completed,
        "kudos": user_public(post.kudos_user) if post.kudos_user else None,
    }

def comment_to_dict(comment: DBComment) -> dict:
    return {
        "id": comment.id,
        "author": user_public(comment.author),
        "content": comment.content,
        "created_at": comment.created_at,
    }

def message_to_dict(message: DBMessage) -> dict:
    return {
        "id": message.id,
        "from_id": message.from_id,
        "to_id": message.to_id,
        "content": message.content,
        "created_at": message.created_at,
    }

def notification_to_dict(notif: DBNotification) -> dict:
    return {
        "id": notif.id,
        "user_id": notif.user_id,
        "type": notif.type,
        "content": notif.content,
        "post_id": notif.post_id,
        "created_at": notif.created_at,
        "read": notif.read,
    }

def add_notification(db: Session, user_id: str, type: str, content: str, post_id: Optional[str] = None):
    db.add(DBNotification(
        id=make_id(),
        user_id=user_id,
        type=type,
        content=content,
        post_id=post_id,
        created_at=now_ts(),
        read=False,
    ))

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(DBUser).count() >= MAX_USERS:
        raise HTTPException(status_code=403, detail=f"Max {MAX_USERS} users reached for this demo.")

    if db.query(DBUser).filter(DBUser.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    user_id = make_id()
    user = DBUser(
        id=user_id,
        name=req.name,
        email=req.email,
        display_name=req.display_name,
        password=req.password,
        phone=req.phone,
        profile_picture=req.profile_picture,
        id_verified=req.id_verified,
        city=req.location.city,
        state=req.location.state,
        zip=req.location.zip,
        trust_score=5.0,
        kudos_count=0,
        created_at=now_ts(),
    )
    db.add(user)
    for kid in req.kids:
        db.add(DBKid(id=make_id(), user_id=user_id, age=kid.age))

    db.commit()
    db.refresh(user)
    return {"user": user_public(user), "token": user_id}


@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(
        DBUser.email == req.email, DBUser.password == req.password
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"user": user_public(user), "token": user.id}


@app.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user_public(user)

# ─────────────────────────────────────────────
# POST ROUTES
# ─────────────────────────────────────────────

@app.get("/posts")
def get_posts(user_id: str, radius: int = 50, db: Session = Depends(get_db)):
    requesting_user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not requesting_user:
        raise HTTPException(status_code=404, detail="User not found.")

    cutoff = now_ts() - 24 * 60 * 60 * 1000
    posts = db.query(DBPost).filter(DBPost.created_at >= cutoff).all()

    result = []
    for post in posts:
        if zip_distance(post.author.zip, requesting_user.zip) <= radius:
            result.append(post_to_dict(post))

    result.sort(key=lambda p: p["created_at"], reverse=True)
    return result


@app.post("/posts")
def create_post(user_id: str, req: PostRequest, db: Session = Depends(get_db)):
    author = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not author:
        raise HTTPException(status_code=404, detail="User not found.")

    post_id = make_id()
    post = DBPost(
        id=post_id,
        author_id=user_id,
        content=req.content,
        priority=req.priority,
        radius=req.radius,
        tags=req.tags,
        age_range_min=req.age_range[0] if req.age_range else None,
        age_range_max=req.age_range[1] if req.age_range else None,
        created_at=now_ts(),
        expires_at=now_ts() + 24 * 60 * 60 * 1000,
        shares=0,
        completed=False,
        kudos_user_id=None,
    )
    db.add(post)
    db.flush()  # write post row before creating FK-referencing notifications

    for user in db.query(DBUser).filter(DBUser.id != user_id).all():
        if zip_distance(user.zip, author.zip) > req.radius:
            continue
        if req.age_range:
            if not any(req.age_range[0] <= k.age <= req.age_range[1] for k in user.kids):
                continue
        add_notification(db, user.id, "new_post", f"New {req.priority} request nearby: {req.content[:60]}...", post_id)

    db.commit()
    db.refresh(post)
    return post_to_dict(post)


@app.get("/posts/{post_id}")
def get_post(post_id: str, db: Session = Depends(get_db)):
    post = db.query(DBPost).filter(DBPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    return post_to_dict(post)


@app.post("/posts/{post_id}/comments")
def add_comment(post_id: str, req: CommentRequest, db: Session = Depends(get_db)):
    post = db.query(DBPost).filter(DBPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.completed:
        raise HTTPException(status_code=400, detail="Cannot comment on a completed post.")

    author = db.query(DBUser).filter(DBUser.id == req.author_id).first()
    if not author:
        raise HTTPException(status_code=404, detail="User not found.")

    comment = DBComment(
        id=make_id(),
        post_id=post_id,
        author_id=req.author_id,
        content=req.content,
        created_at=now_ts(),
    )
    db.add(comment)

    if post.author_id != req.author_id:
        add_notification(db, post.author_id, "comment", f"{author.display_name} commented on your post.", post_id)

    db.commit()
    db.refresh(comment)
    return comment_to_dict(comment)


@app.post("/posts/{post_id}/share")
def share_post(post_id: str, user_id: str, db: Session = Depends(get_db)):
    post = db.query(DBPost).filter(DBPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    post.shares += 1

    sharer = db.query(DBUser).filter(DBUser.id == user_id).first()
    if sharer and post.author_id != user_id:
        add_notification(db, post.author_id, "share", f"{sharer.display_name} shared your post.", post_id)

    db.commit()
    return {"shares": post.shares}


@app.post("/posts/{post_id}/complete")
def complete_post(post_id: str, user_id: str, req: CompleteRequest, db: Session = Depends(get_db)):
    post = db.query(DBPost).filter(DBPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.author_id != user_id:
        raise HTTPException(status_code=403, detail="Only the post author can complete a post.")
    if post.completed:
        raise HTTPException(status_code=400, detail="Post already completed.")

    kudos_user = db.query(DBUser).filter(DBUser.id == req.kudos_user_id).first()
    if not kudos_user:
        raise HTTPException(status_code=404, detail="Kudos user not found.")

    post.completed = True
    post.kudos_user_id = req.kudos_user_id
    kudos_user.kudos_count += 1

    author = db.query(DBUser).filter(DBUser.id == user_id).first()
    add_notification(db, req.kudos_user_id, "kudos", f"{author.display_name} gave you Kudos! 🏆", post_id)

    db.commit()
    db.refresh(post)
    return post_to_dict(post)

# ─────────────────────────────────────────────
# MESSAGE ROUTES
# ─────────────────────────────────────────────

@app.post("/messages")
def send_message(req: MessageRequest, db: Session = Depends(get_db)):
    sender = db.query(DBUser).filter(DBUser.id == req.from_id).first()
    receiver = db.query(DBUser).filter(DBUser.id == req.to_id).first()
    if not sender or not receiver:
        raise HTTPException(status_code=404, detail="User not found.")

    message = DBMessage(
        id=make_id(),
        from_id=req.from_id,
        to_id=req.to_id,
        content=req.content,
        created_at=now_ts(),
    )
    db.add(message)
    add_notification(db, req.to_id, "message", f"New message from {sender.display_name}")
    db.commit()
    db.refresh(message)
    return message_to_dict(message)


@app.get("/messages/{user_id}/{other_id}")
def get_messages(user_id: str, other_id: str, db: Session = Depends(get_db)):
    messages = (
        db.query(DBMessage)
        .filter(
            or_(
                and_(DBMessage.from_id == user_id, DBMessage.to_id == other_id),
                and_(DBMessage.from_id == other_id, DBMessage.to_id == user_id),
            )
        )
        .order_by(DBMessage.created_at)
        .all()
    )
    return [message_to_dict(m) for m in messages]

# ─────────────────────────────────────────────
# NOTIFICATION ROUTES
# ─────────────────────────────────────────────

@app.get("/notifications/{user_id}")
def get_notifications(user_id: str, db: Session = Depends(get_db)):
    notifs = (
        db.query(DBNotification)
        .filter(DBNotification.user_id == user_id)
        .order_by(DBNotification.created_at.desc())
        .all()
    )
    return [notification_to_dict(n) for n in notifs]


@app.patch("/notifications/{notif_id}/read")
def mark_read(notif_id: str, db: Session = Depends(get_db)):
    notif = db.query(DBNotification).filter(DBNotification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notif.read = True
    db.commit()
    db.refresh(notif)
    return notification_to_dict(notif)

# ─────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────

@app.get("/")
def root(db: Session = Depends(get_db)):
    return {
        "status": "ParentsHub API running",
        "users": db.query(DBUser).count(),
        "max_users": MAX_USERS,
        "posts": db.query(DBPost).count(),
        "messages": db.query(DBMessage).count(),
    }
