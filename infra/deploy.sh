#!/usr/bin/env bash
# deploy.sh — GCP Cloud Run deployment for TravelEngine
# Usage: ./infra/deploy.sh
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────
GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
GCP_REGION="${GCP_REGION:-us-central1}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:?Set FIREBASE_PROJECT_ID env var}"
OPENWEATHERMAP_API_KEY="${OPENWEATHERMAP_API_KEY:?Set OPENWEATHERMAP_API_KEY env var}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD env var}"
CORS_ORIGIN="${CORS_ORIGIN:-https://frontend-HASH-uc.a.run.app}"

ARTIFACT_REGISTRY_REPO="travel-engine"
BACKEND_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/api"
FRONTEND_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/frontend"
CLOUD_SQL_INSTANCE="${GCP_PROJECT_ID}:${GCP_REGION}:travel-engine-db"
SA_NAME="travel-engine-sa"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

echo "🚀 Deploying TravelEngine to GCP project: ${GCP_PROJECT_ID}"

# ── Enable required APIs ─────────────────────────────────────────
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  pubsub.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${GCP_PROJECT_ID}"

# ── Artifact Registry repo ───────────────────────────────────────
gcloud artifacts repositories create "${ARTIFACT_REGISTRY_REPO}" \
  --repository-format=docker \
  --location="${GCP_REGION}" \
  --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "Repo already exists"

gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

# ── Service Account ──────────────────────────────────────────────
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="TravelEngine Service Account" \
  --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "SA already exists"

for ROLE in \
  roles/cloudsql.client \
  roles/pubsub.editor \
  roles/aiplatform.user \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" --quiet
done

# ── Cloud SQL instance ───────────────────────────────────────────
gcloud sql instances create travel-engine-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="${GCP_REGION}" \
  --storage-auto-increase \
  --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "SQL instance already exists"

gcloud sql databases create travelengine \
  --instance=travel-engine-db \
  --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "DB already exists"

gcloud sql users set-password postgres \
  --instance=travel-engine-db \
  --password="${DB_PASSWORD}" \
  --project="${GCP_PROJECT_ID}"

# ── Secret Manager ───────────────────────────────────────────────
store_secret() {
  local NAME=$1 VALUE=$2
  echo -n "${VALUE}" | gcloud secrets create "${NAME}" --data-file=- \
    --project="${GCP_PROJECT_ID}" 2>/dev/null || \
  echo -n "${VALUE}" | gcloud secrets versions add "${NAME}" --data-file=- \
    --project="${GCP_PROJECT_ID}"
  gcloud secrets add-iam-policy-binding "${NAME}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor \
    --project="${GCP_PROJECT_ID}" --quiet
}

DB_CONN_STR="Host=/cloudsql/${CLOUD_SQL_INSTANCE};Database=travelengine;Username=postgres;Password=${DB_PASSWORD}"
store_secret "db-connection-string" "${DB_CONN_STR}"
store_secret "openweathermap-api-key" "${OPENWEATHERMAP_API_KEY}"

# ── Pub/Sub topics & subscriptions ──────────────────────────────
for TOPIC in weather-alerts trip-updates; do
  gcloud pubsub topics create "${TOPIC}" --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "Topic ${TOPIC} already exists"
  gcloud pubsub subscriptions create "${TOPIC}-sub" \
    --topic="${TOPIC}" \
    --ack-deadline=60 \
    --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "Subscription ${TOPIC}-sub already exists"
done

# ── Build & push images ──────────────────────────────────────────
echo "📦 Building backend image..."
docker build -t "${BACKEND_IMAGE}:latest" ./backend/TravelEngine.Api
docker push "${BACKEND_IMAGE}:latest"

echo "📦 Building frontend image..."
docker build -t "${FRONTEND_IMAGE}:latest" ./frontend
docker push "${FRONTEND_IMAGE}:latest"

# ── Deploy backend to Cloud Run ──────────────────────────────────
echo "☁️  Deploying backend..."
gcloud run deploy travel-engine-api \
  --image="${BACKEND_IMAGE}:latest" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="${SA_EMAIL}" \
  --add-cloudsql-instances="${CLOUD_SQL_INSTANCE}" \
  --set-secrets="ConnectionStrings__DefaultConnection=db-connection-string:latest,Weather__OpenWeatherMapApiKey=openweathermap-api-key:latest" \
  --set-env-vars="\
Firebase__ProjectId=${FIREBASE_PROJECT_ID},\
Gcp__ProjectId=${GCP_PROJECT_ID},\
Gcp__Location=${GCP_REGION},\
Gcp__GeminiModel=gemini-1.5-pro,\
Cors__AllowedOrigins__0=${CORS_ORIGIN},\
ASPNETCORE_ENVIRONMENT=Production" \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --port=8080 \
  --project="${GCP_PROJECT_ID}"

BACKEND_URL=$(gcloud run services describe travel-engine-api \
  --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}" \
  --format="value(status.url)")

echo "✅ Backend URL: ${BACKEND_URL}"

# ── Deploy frontend to Cloud Run ─────────────────────────────────
echo "☁️  Deploying frontend..."
gcloud run deploy travel-engine-frontend \
  --image="${FRONTEND_IMAGE}:latest" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=80 \
  --project="${GCP_PROJECT_ID}"

FRONTEND_URL=$(gcloud run services describe travel-engine-frontend \
  --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}" \
  --format="value(status.url)")

echo "✅ Frontend URL: ${FRONTEND_URL}"
echo ""
echo "🎉 Deployment complete!"
echo "   Frontend : ${FRONTEND_URL}"
echo "   Backend  : ${BACKEND_URL}"
echo "   Swagger  : ${BACKEND_URL}/swagger"
echo ""
echo "⚠️  Add '${FRONTEND_URL}' to your Firebase authorized domains"
echo "⚠️  Update CORS_ORIGIN to '${FRONTEND_URL}' and redeploy backend if needed"
