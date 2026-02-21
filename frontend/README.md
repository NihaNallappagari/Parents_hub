# ParentsHub 👨‍👩‍👧‍👦

A hyperlocal parent-to-parent help network. Parents can post urgent requests (medicine, supplies, toys) that notify nearby parents based on location and kids' ages.

---

## Project Structure

```
parentshub/
├── backend/
│   ├── main.py           ← FastAPI app (in-memory storage)
│   └── requirements.txt  ← Python dependencies
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx       ← Full React app with all screens
        └── index.css
```

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS      |
| Backend   | Python 3.11+, FastAPI, Pydantic   |
| Storage   | In-memory (Python dicts/lists)    |
| API style | REST, JSON                        |
| Icons     | Lucide React                      |

---

## Setup & Running

### 1. Backend (FastAPI)

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate       # Mac/Linux
venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Run the backend
uvicorn main:app --reload --port 8000
```

Backend will be live at: **http://localhost:8000**

API docs (Swagger): **http://localhost:8000/docs**

---

### 2. Frontend (React)

Open a **new terminal tab**, then:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Frontend will be live at: **http://localhost:3000**

---

## API Endpoints

### Auth
| Method | Endpoint         | Description              |
|--------|-----------------|--------------------------|
| POST   | /auth/register  | Create account (max 5)   |
| POST   | /auth/login     | Login                    |
| GET    | /users/{id}     | Get public user profile  |

### Posts
| Method | Endpoint                    | Description                         |
|--------|-----------------------------|-------------------------------------|
| GET    | /posts?user_id=&radius=     | Get nearby posts (24h only)         |
| POST   | /posts?user_id=             | Create new post                     |
| GET    | /posts/{id}                 | Get single post with comments       |
| POST   | /posts/{id}/comments        | Add a comment                       |
| POST   | /posts/{id}/share?user_id=  | Share a post                        |
| POST   | /posts/{id}/complete?user_id=| Mark complete + give kudos         |

### Messages
| Method | Endpoint                     | Description                     |
|--------|------------------------------|---------------------------------|
| POST   | /messages                    | Send a direct message           |
| GET    | /messages/{user_id}/{other}  | Get chat history                |

### Notifications
| Method | Endpoint                     | Description                     |
|--------|------------------------------|---------------------------------|
| GET    | /notifications/{user_id}     | Get all notifications           |
| PATCH  | /notifications/{id}/read     | Mark notification as read       |

### Health
| Method | Endpoint | Description              |
|--------|----------|--------------------------|
| GET    | /        | API status + user count  |

---

## Features

- ✅ User registration & login (max 5 users for demo)
- ✅ Parent profiles with public kids ages
- ✅ Create posts with priority level (Emergency Medical, Important, General)
- ✅ Adjustable radius per post (10 / 20 / 30 / 50 miles)
- ✅ Smart filtering: notify only parents with kids in matching age range
- ✅ 24-hour auto-expiring posts
- ✅ Flat comments (no nested replies, no likes)
- ✅ Direct messaging between parents
- ✅ Share posts
- ✅ Mark post as completed (only post author can)
- ✅ Kudos system (tag who helped → shows on their profile)
- ✅ Full notification system for all activities
- ✅ Trust score per user
- ✅ Kudos section on profile
- ✅ All API calls from frontend to backend

---

## Notes

- **In-memory storage** means all data resets when the backend restarts
- Max 5 users enforced by the backend
- Location matching uses ZIP code proximity (simplified) — replace with PostGIS/Google Maps for production
- No authentication tokens (user ID used as token for demo simplicity)
- To upgrade to production: add PostgreSQL + MongoDB, real JWT auth, and deploy to AWS/DigitalOcean

---

## Next Steps for Production

1. Replace in-memory storage with PostgreSQL + MongoDB
2. Add real JWT authentication
3. Integrate real geolocation (PostGIS or Google Maps)
4. Add Firebase push notifications
5. Add image upload (AWS S3 or Cloudinary)
6. Add ID verification (Stripe Identity or similar)
7. Deploy backend to AWS EC2 / DigitalOcean
8. Deploy frontend to Vercel
