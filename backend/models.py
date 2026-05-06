from sqlalchemy import Column, String, Integer, Float, Boolean, BigInteger, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    password = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    profile_picture = Column(String, default="👤")
    id_verified = Column(Boolean, default=False)
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    zip = Column(String, nullable=False)
    trust_score = Column(Float, default=5.0)
    kudos_count = Column(Integer, default=0)
    created_at = Column(BigInteger, nullable=False)

    kids = relationship("Kid", back_populates="user", cascade="all, delete-orphan")
    posts = relationship("Post", foreign_keys="Post.author_id", back_populates="author")
    notifications = relationship("Notification", back_populates="user")


class Kid(Base):
    __tablename__ = "kids"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    age = Column(Integer, nullable=False)

    user = relationship("User", back_populates="kids")


class Post(Base):
    __tablename__ = "posts"

    id = Column(String, primary_key=True)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    priority = Column(String, nullable=False)
    radius = Column(Integer, nullable=False)
    tags = Column(ARRAY(String), default=[])
    age_range_min = Column(Integer, nullable=True)
    age_range_max = Column(Integer, nullable=True)
    created_at = Column(BigInteger, nullable=False)
    expires_at = Column(BigInteger, nullable=False)
    shares = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    kudos_user_id = Column(String, ForeignKey("users.id"), nullable=True)

    author = relationship("User", foreign_keys=[author_id], back_populates="posts")
    kudos_user = relationship("User", foreign_keys=[kudos_user_id])
    comments = relationship(
        "Comment",
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="Comment.created_at",
    )
    notifications = relationship("Notification", back_populates="post")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(String, primary_key=True)
    post_id = Column(String, ForeignKey("posts.id"), nullable=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(BigInteger, nullable=False)

    post = relationship("Post", back_populates="comments")
    author = relationship("User")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    from_id = Column(String, ForeignKey("users.id"), nullable=False)
    to_id = Column(String, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(BigInteger, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    post_id = Column(String, ForeignKey("posts.id"), nullable=True)
    created_at = Column(BigInteger, nullable=False)
    read = Column(Boolean, default=False)

    user = relationship("User", back_populates="notifications")
    post = relationship("Post", back_populates="notifications")
