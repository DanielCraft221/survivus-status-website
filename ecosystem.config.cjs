module.exports = {
  apps: [{
    name: "statuspage",
    script: ".next/standalone/server.js",
    cwd: "/var/www/statuspage",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      HOSTNAME: "127.0.0.1"
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: "512M",
    error_file: "/var/log/statuspage/error.log",
    out_file: "/var/log/statuspage/out.log",
    time: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}