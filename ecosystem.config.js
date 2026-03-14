module.exports = {
  apps: [
    {
      name: 'findthem-api',
      script: 'apps/api/dist/index.js',
      cwd: '/home/ubuntu/findthem',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
