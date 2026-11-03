module.exports = {
  apps: [
    {
      name: "my-backend",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "450M",
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10_000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
