#!/usr/bin/env bash
# Deploy to Google Cloud Functions (2nd gen). Adjust REGION and PROJECT.
set -euo pipefail

REGION="${REGION:-us-central1}"
PROJECT="${PROJECT:-YOUR_GCP_PROJECT}"
FUNCTION_NAME="${FUNCTION_NAME:-run_evolution}"

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=python312 \
  --region="$REGION" \
  --source=. \
  --entry-point=run_evolution \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256Mi \
  --timeout=30s \
  --max-instances=30 \
  --project="$PROJECT"

echo "Set CLOUD_FUNCTION_URL in backend .env to the function URL printed above."
