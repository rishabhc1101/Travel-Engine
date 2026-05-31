# Travel Planning & Experience Engine

A full-stack web app that generates AI-powered day-by-day travel itineraries with real-time weather alerts.

**Stack:** React 19 + TypeScript + Tailwind CSS v4 · ASP.NET Core 8 · PostgreSQL 16 · Firebase Auth · GCP (Cloud Run, Cloud SQL, Pub/Sub)

---

## Local Setup — Step by Step

### 1. Prerequisites

Make sure these are installed:

| Tool | Check |
|---|---|
| .NET 8 SDK | `dotnet --version` → `8.x` |
| Node.js 20+ | `node --version` |
| Docker Desktop | running (for PostgreSQL) |
| gcloud CLI | `gcloud --version` |
| EF Core tools | `dotnet tool install --global dotnet-ef` |

---

### 2. Start PostgreSQL

```bash
docker run -d --name travel-pg \
  -e POSTGRES_DB=travelengine \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16-alpine
```

Verify it's running: `docker ps` — you should see `travel-pg`.

---

### 3. Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. **Authentication** → **Get started** → enable **Email/Password** and **Google**
3. **Project Settings** (gear) → **General** → scroll to **Your apps** → **Add app** → Web
4. Copy the config values — you'll use them in step 5

---

### 4. GCP Authentication (gcloud)

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_GCP_PROJECT_ID
```

The second command (`application-default login`) sets up credentials the backend uses automatically via the Google Cloud SDK.

---

### 5. Configure the Backend

Edit `backend/TravelEngine.Api/appsettings.Development.json` — fill in your values:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=travelengine;Username=postgres;Password=postgres"
  },
  "Firebase": {
    "ProjectId": "your-firebase-project-id"
  },
  "Gcp": {
    "ProjectId": "your-gcp-project-id",
    "Location": "us-central1",
    "GeminiModel": "gemini-1.5-pro"
  },
  "Weather": {
    "OpenWeatherMapApiKey": "your-openweathermap-key"
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:5173" ]
  }
}
```

> **OpenWeatherMap key:** Free account at [openweathermap.org](https://openweathermap.org/api) → API keys tab.  
> **Gcp:ProjectId:** Can be any value for now — only needed when Pub/Sub and Gemini are used.

---

### 6. Configure the Frontend

```bash
cd frontend
copy .env.example .env.local
```

Edit `frontend/.env.local` with your Firebase values from step 3:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_MAPS_API_KEY=...
```

> **Google Maps key:** [console.cloud.google.com/apis](https://console.cloud.google.com/apis) → enable Maps JavaScript API + Places API → Credentials → Create API Key.

---

### 7. Run the Backend

```bash
cd backend/TravelEngine.Api
dotnet run --launch-profile http
```

The API starts at **http://localhost:5152**  
Swagger UI: **http://localhost:5152/swagger**

> EF Core migrations run automatically on startup — the database tables are created for you.

---

### 8. Run the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

App opens at **http://localhost:5173**  
API calls are proxied automatically to `http://localhost:5152`.

---

## What Works Now (No GCP Needed)

| Feature | Status |
|---|---|
| Sign up / Sign in (Email + Google) | ✅ Works — needs Firebase only |
| User profile stored in PostgreSQL | ✅ Works |
| View trip dashboard | ✅ Works |
| Create trip with itinerary | ✅ Works — template-based generator (no GCP needed) |
| Trip itinerary detail page | ✅ Works once a trip exists |
| Google Maps on itinerary | ✅ Works with Maps API key |
| Real-time weather alerts (SSE) | ⚙️ Needs Cloud Pub/Sub enabled |
| Weather current conditions | ⚙️ Needs OpenWeatherMap key |

---

## GCP Services Setup (when ready)

### Enable APIs

```bash
gcloud services enable \
  sqladmin.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com
```

### Create Pub/Sub topics

```bash
gcloud pubsub topics create weather-alerts
gcloud pubsub topics create trip-updates
gcloud pubsub subscriptions create weather-alerts-sub --topic=weather-alerts --ack-deadline=60
gcloud pubsub subscriptions create trip-updates-sub   --topic=trip-updates   --ack-deadline=60
```

---

## Cloud Deployment

### 1. Fill in deployment config

Copy the template and fill in your values:

```bash
cp infra/.env.deploy.example infra/.env.deploy
# then edit infra/.env.deploy
```

Required values in `infra/.env.deploy`:

```env
GCP_PROJECT_ID=your-gcp-project-id
DB_PASSWORD=choose-a-strong-password
OPENWEATHERMAP_API_KEY=your-key        # openweathermap.org → free signup
FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_MAPS_API_KEY=...           # console.cloud.google.com → Maps JavaScript API
```

> `infra/.env.deploy` is gitignored — your secrets stay local.

### 2. Run the script (Git Bash or WSL on Windows)

```bash
bash infra/deploy.sh
```

The script automatically:
- Enables required GCP APIs
- Creates a service account with least-privilege roles
- Provisions Cloud SQL PostgreSQL 15 (auto-starts if stopped)
- Stores secrets in Secret Manager
- Creates Pub/Sub topics (`weather-alerts`, `trip-updates`)
- Builds and pushes Docker images to Artifact Registry
- Deploys backend + frontend to Cloud Run
- Prints the live URLs

### 3. After deployment

Add your Cloud Run frontend URL to Firebase authorized domains:
**Firebase Console → Authentication → Settings → Authorized domains → Add domain**

---

## Project Structure

```
├── backend/TravelEngine.Api/
│   ├── Controllers/        # TripsController, UsersController
│   ├── Data/               # EF Core DbContext
│   ├── Models/             # Trip, ItineraryDay, Activity, User
│   ├── Services/           # GeminiService, WeatherService, PubSubService
│   ├── BackgroundServices/ # WeatherPollingService (30-min interval)
│   └── DTOs/               # Request / response records
├── frontend/src/
│   ├── pages/              # Login, Signup, Dashboard, PlanTrip, TripDetail
│   ├── contexts/           # AuthContext (Firebase)
│   ├── hooks/              # useTripStream (SSE)
│   └── lib/                # api.ts (axios + auth), firebase.ts
├── infra/deploy.sh         # GCP Cloud Run deployment
└── docker-compose.yml      # Full local stack
```