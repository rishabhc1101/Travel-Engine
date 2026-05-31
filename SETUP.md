# Travel Planning & Experience Engine — Setup Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Clone & Repository Setup](#clone--repository-setup)
3. [Firebase Setup](#firebase-setup)
4. [GCP Project Setup](#gcp-project-setup)
5. [Backend Configuration](#backend-configuration)
6. [Frontend Configuration](#frontend-configuration)
7. [Local Development](#local-development)
8. [Push to GitHub](#push-to-github)

---

## Prerequisites

Install all of the following before continuing:

| Tool | Version | Install |
|---|---|---|
| .NET SDK | 9.x | https://dotnet.microsoft.com/download/dotnet/9.0 |
| Node.js | 20+ | https://nodejs.org |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Git | latest | https://git-scm.com |
| Google Cloud CLI | latest | https://cloud.google.com/sdk/docs/install |
| EF Core CLI tools | 9.x | `dotnet tool install --global dotnet-ef` |

Verify installations:
```bash
dotnet --version          # 9.x
node --version            # 20+
docker --version
gcloud --version
dotnet ef --version
```

---

## Clone & Repository Setup

### Create a `.gitignore`

Create `.gitignore` in the project root with these entries (already covered below in [Push to GitHub](#push-to-github)).

---

## Firebase Setup

### 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → enter a project name (e.g. `travel-engine`)
3. Disable Google Analytics (optional) → **Create project**

### 2. Enable Authentication

1. In the Firebase Console → **Authentication** → **Get started**
2. Under **Sign-in method**, enable:
   - **Email/Password** → toggle on → **Save**
   - **Google** → toggle on → add your support email → **Save**

### 3. Get Firebase Web Config

1. In Firebase Console → **Project Settings** (gear icon) → **General** tab
2. Under **Your apps** → click **Add app** → choose **Web** (`</>`)
3. Register the app with a nickname (e.g. `travel-engine-web`)
4. Copy the `firebaseConfig` object — you'll need these values:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "...",
  appId: "..."
}
```

### 4. Add Authorized Domains

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Add `localhost` (already there by default)
3. After deploying to Cloud Run, add the Cloud Run URL here too

---

## GCP Project Setup

> **Note:** GCP CLI installation in progress. Run these steps once `gcloud` is available.

### 1. Authenticate and Set Project

```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

### 2. Link Billing Account

A billing account must be linked to use Cloud Run and Cloud SQL:
1. Go to [console.cloud.google.com/billing](https://console.cloud.google.com/billing)
2. Link your billing account to the project

### 3. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com
```

### 4. Create Cloud SQL (PostgreSQL 15)

```bash
gcloud sql instances create travel-engine-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-auto-increase

gcloud sql databases create travelengine --instance=travel-engine-db

gcloud sql users set-password postgres \
  --instance=travel-engine-db \
  --password=YOUR_STRONG_DB_PASSWORD
```

Note your **connection string** — you'll need it for the backend:
```
Host=/cloudsql/PROJECT_ID:us-central1:travel-engine-db;Database=travelengine;Username=postgres;Password=YOUR_PASSWORD
```

### 5. Create Pub/Sub Topics & Subscriptions

```bash
gcloud pubsub topics create weather-alerts
gcloud pubsub topics create trip-updates

gcloud pubsub subscriptions create weather-alerts-sub \
  --topic=weather-alerts --ack-deadline=60

gcloud pubsub subscriptions create trip-updates-sub \
  --topic=trip-updates --ack-deadline=60
```

### 6. Create Service Account

```bash
gcloud iam service-accounts create travel-engine-sa \
  --display-name="TravelEngine Service Account"

# Grant required roles
SA=travel-engine-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role=roles/cloudsql.client

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role=roles/pubsub.editor

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
```

### 7. Download Service Account Key (local dev only)

```bash
mkdir -p secrets
gcloud iam service-accounts keys create secrets/gcp-key.json \
  --iam-account=travel-engine-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

> ⚠️ `secrets/gcp-key.json` is in `.gitignore` — never commit it.

### 8. Get OpenWeatherMap API Key

1. Sign up at [openweathermap.org](https://openweathermap.org/api)
2. Go to **API keys** → copy your key (free tier is sufficient)

### 9. Get Google Maps API Key

1. Go to [console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)
2. Enable:
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
   - **Geocoding API**
3. Go to **Credentials** → **Create Credentials** → **API Key**
4. Restrict the key to the above 4 APIs + your domain (for production)

---

## Backend Configuration

Edit `backend/TravelEngine.Api/appsettings.Development.json` — replace all `YOUR_*` placeholders:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=travelengine;Username=postgres;Password=postgres"
  },
  "Firebase": {
    "ProjectId": "YOUR_FIREBASE_PROJECT_ID"
  },
  "Gcp": {
    "ProjectId": "YOUR_GCP_PROJECT_ID",
    "Location": "us-central1",
    "GeminiModel": "gemini-1.5-pro"
  },
  "Weather": {
    "OpenWeatherMapApiKey": "YOUR_OPENWEATHERMAP_API_KEY"
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:5173" ]
  }
}
```

### Run EF Core Migration

```bash
cd backend/TravelEngine.Api
dotnet ef migrations add InitialCreate
dotnet ef database update
```

> For local dev, the API also auto-runs migrations on startup.

---

## Frontend Configuration

Copy the example env file and fill in your values:

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

---

## Local Development

### Option A — Docker Compose (recommended)

```bash
# From project root
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| Swagger UI | http://localhost:8080/swagger |
| PostgreSQL | localhost:5432 |

### Option B — Run separately

**Start PostgreSQL** (Docker):
```bash
docker run -d --name travel-pg \
  -e POSTGRES_DB=travelengine \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 postgres:16-alpine
```

**Start backend:**
```bash
cd backend/TravelEngine.Api
set GOOGLE_APPLICATION_CREDENTIALS=../../secrets/gcp-key.json
dotnet run
# API running at http://localhost:5270
```

**Start frontend:**
```bash
cd frontend
npm run dev
# App running at http://localhost:5173
```

---

## Push to GitHub

### 1. Create `.gitignore`

Create a `.gitignore` in the project root:

```gitignore
# Secrets — never commit
secrets/
*.json.key
**/.env.local
**/.env.*.local
frontend/.env

# .NET
**/bin/
**/obj/
*.user

# Node
**/node_modules/
frontend/dist/

# IDEs
.vs/
.vscode/
*.suo
*.user

# OS
.DS_Store
Thumbs.db
```

### 2. Create the GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `travel-engine` (or your preferred name)
3. Set visibility: **Private** (recommended — contains config placeholders)
4. **Do NOT** initialize with README, .gitignore, or license (we already have files)
5. Click **Create repository**
6. Copy the repository URL (e.g. `https://github.com/YOUR_USERNAME/travel-engine.git`)

### 3. Commit and Push

Run from the project root:

```bash
# Create .gitignore first (see content above)
git add .gitignore
git commit -m "chore: add gitignore"

git add .
git commit -m "feat: initial implementation — Travel Planning & Experience Engine

- React 19 + TypeScript + Tailwind frontend
  - Firebase Auth (Google + Email)
  - Trip planner form with AI itinerary generation
  - Day-by-day itinerary view with Google Maps
  - SSE real-time weather alerts
  - Dashboard with trip cards

- ASP.NET Core 9 backend
  - EF Core + Cloud SQL (PostgreSQL 15)
  - Gemini 1.5 Pro itinerary generation (Vertex AI)
  - OpenWeatherMap integration + Cloud Pub/Sub alerts
  - Firebase JWT authentication middleware
  - Swagger UI

- GCP infrastructure
  - Cloud Run (backend + frontend containers)
  - Cloud SQL PostgreSQL 15
  - Cloud Pub/Sub (weather-alerts, trip-updates)
  - Secret Manager for credentials
  - deploy.sh automation script

- Docker Compose for local development"

git remote add origin https://github.com/YOUR_USERNAME/travel-engine.git
git push -u origin main
```

### 4. Protect the main branch (recommended)

In GitHub → **Settings** → **Branches** → **Add branch protection rule**:
- Branch name pattern: `main`
- Check: **Require a pull request before merging**
- Check: **Do not allow bypassing the above settings**

---

## Deployment to GCP

Once GCP CLI is installed and configured:

```bash
# Set required env vars
export GCP_PROJECT_ID=your_gcp_project_id
export FIREBASE_PROJECT_ID=your_firebase_project_id
export OPENWEATHERMAP_API_KEY=your_openweathermap_key
export DB_PASSWORD=your_db_password

# Run the deploy script
chmod +x infra/deploy.sh
./infra/deploy.sh
```

This script handles:
- Building and pushing Docker images to Artifact Registry
- Deploying backend to Cloud Run (with Cloud SQL proxy)
- Deploying frontend to Cloud Run
- Storing secrets in Secret Manager
- Setting up Pub/Sub topics
