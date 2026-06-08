#!/usr/bin/env bash
set -euo pipefail

if [ ! -f /etc/os-release ] || ! grep -qi "amazon linux" /etc/os-release; then
  echo "This bootstrap script is for Amazon Linux only." >&2
  exit 1
fi

source /etc/os-release

if command -v dnf >/dev/null 2>&1; then
  sudo dnf update -y
  sudo dnf install -y ca-certificates curl gnupg2 docker nginx certbot python3-certbot-nginx || \
    sudo dnf install -y ca-certificates curl gnupg2 docker nginx certbot
  sudo dnf install -y docker-compose-plugin || true
elif command -v yum >/dev/null 2>&1; then
  sudo yum update -y
  if command -v amazon-linux-extras >/dev/null 2>&1; then
    sudo amazon-linux-extras install -y docker nginx1 epel || true
  fi
  sudo yum install -y ca-certificates curl gnupg2 docker nginx certbot python3-certbot-nginx || \
    sudo yum install -y ca-certificates curl gnupg2 docker nginx certbot
  sudo yum install -y docker-compose-plugin || true
else
  echo "Neither dnf nor yum is available." >&2
  exit 1
fi

sudo systemctl daemon-reload || true
sudo systemctl enable --now docker
sudo systemctl enable --now nginx

if ! sudo docker compose version >/dev/null 2>&1; then
  compose_arch="$(uname -m)"
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${compose_arch}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

sudo usermod -aG docker "$USER"
sudo mkdir -p /opt/aigentra-trading
sudo chown "$USER:$USER" /opt/aigentra-trading

echo "Amazon Linux bootstrap complete. Reconnect your SSH session before running docker without sudo."
