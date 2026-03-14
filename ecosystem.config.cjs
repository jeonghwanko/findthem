module.exports = {
  apps: [
    {
      name: 'findthem-api',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/findthem/apps/api',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
