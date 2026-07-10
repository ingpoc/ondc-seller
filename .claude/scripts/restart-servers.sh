#!/bin/bash
# restart-servers.sh - ONDC UCP Seller Portal
#
# Purpose: Restart Vite dev server
#
# CUSTOMIZED FOR:
# - Vite dev server on port 43103
# - No backend (API calls proxied)
#
# Usage: ./restart-servers.sh

set -e

FRONTEND_PORT=43103

echo "=== Restarting Vite Dev Server ==="

# ============================================================================
# Kill existing process on port
# ============================================================================

kill_port() {
  local port=$1
  local pid=$(lsof -ti:$port 2>/dev/null || true)

  if [ -n "$pid" ]; then
    echo "Killing process on port $port (PID: $pid)"
    kill -9 $pid 2>/dev/null || true
    sleep 1
  else
    echo "No process found on port $port"
  fi
}

kill_port $FRONTEND_PORT

# ============================================================================
# Start Vite dev server
# ============================================================================

echo ""
echo "Starting Vite dev server on port $FRONTEND_PORT..."
mkdir -p logs
nohup npm run dev > logs/vite.log 2>&1 &
VITE_PID=$!

echo "Vite dev server started (PID: $VITE_PID)"
echo "Logs: logs/vite.log"

# ============================================================================
# Wait for server to be ready
# ============================================================================

echo ""
echo "Waiting for server to start..."

max_wait=15
count=0

while [ $count -lt $max_wait ]; do
  if curl -sf "http://127.0.0.1:$FRONTEND_PORT" > /dev/null 2>&1; then
    echo "✓ Vite dev server is ready"
    break
  fi
  sleep 1
  count=$((count + 1))
  echo -n "."
done

if [ $count -eq $max_wait ]; then
  echo ""
  echo "✗ Server failed to start within ${max_wait}s" >&2
  echo "Check logs: logs/vite.log" >&2
  exit 1
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "=== Server restarted successfully ==="
echo "URL:  http://127.0.0.1:$FRONTEND_PORT"
echo "Logs: logs/vite.log"

exit 0
