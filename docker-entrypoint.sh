#!/bin/sh
set -e

# Ensure persistent data directory exists
mkdir -p /data

# If the persistent SQLite DB does not exist, initialize it from bundled repository DB
if [ ! -f /data/trading_platform.db ] && [ -f /app/data/trading_platform.db ]; then
    echo "Initializing persistent database from bundled template..."
    cp /app/data/trading_platform.db /data/trading_platform.db
    echo "Database initialized successfully."
fi

# Execute CMD passed to container
exec "$@"
