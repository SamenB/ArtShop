#!/bin/bash
# ==============================================================
# ArtShop Production Backup Script
# This script creates a secure backup dump of the Postgres database
# and performs a smart transparent sync of all raw media photos 
# directly to Google Drive via rclone.
# 
# Usage: ./backup.sh 
# Recommended: Set up as a daily cron job (e.g., 03:00 AM)
# ==============================================================

# Variables
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="/tmp/artshop_backup_$DATE"
RCLONE_REMOTE="gdrive:ArtShop_Backups" # Make sure 'gdrive' matches your rclone config name!

echo "Starting ArtShop backup process at $DATE..."

# 1. Prepare temporary host directory
mkdir -p "$BACKUP_DIR"

# 2. Database Backup (PostgreSQL)
echo "[1/4] Dumping PostgreSQL database..."
# We execute a shell inside the running DB container so it automatically read its own POSTGRES_USER and POSTGRES_DB environment vars.
docker exec artshop_db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > "$BACKUP_DIR/db_$DATE.dump"

if [ $? -eq 0 ]; then
    echo "  -> Database dump successful."
else
    echo "  -> ERROR: Database dump failed!"
    exit 1
fi

# 3. Database Sync to Google Drive
echo "[2/3] Uploading Database Dump to Google Drive..."
rclone copy "$BACKUP_DIR" "${RCLONE_REMOTE}/Databases"

if [ $? -eq 0 ]; then
    echo "  -> Database upload successful."
else
    echo "  -> ERROR: Database Rclone upload failed!"
    exit 1
fi

# 4. Smart Media Sync (Differential)
echo "[3/3] Synchronizing Media Files (Smart Sync)..."
# Instead of zipping everything, 'rclone sync' compares the Docker volume 
# and your Google Drive, uploading only the NEW or CHANGED photos.
docker run --rm \
    -v artshop_media_data:/media:ro \
    -v /root/.config/rclone:/root/.config/rclone:ro \
    rclone/rclone:latest sync /media "${RCLONE_REMOTE}/Media" --progress

if [ $? -eq 0 ]; then
    echo "  -> Media sync successful. Only new files were transferred!"
else
    echo "  -> ERROR: Media sync failed."
    exit 1
fi

# 5. Cleanup local temp files
echo "[Cleanup] Removing local database dump..."
rm -rf "$BACKUP_DIR"

# Optional: Delete backups older than 30 days securely from Google Drive to save space
# echo "Cleaning up old backups from Google Drive (older than 30 days)..."
# rclone delete "$RCLONE_REMOTE" --min-age 30d

echo "✅ Backup process completely successfully!"
