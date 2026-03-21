module.exports = {
  apps: [
    {
      name: 'findthem-api',
      script: 'npm',
      args: 'start',
      cwd: '/home/ubuntu/findthem/apps/api',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'ghost',
      script: 'ghost',
      args: 'run',
      cwd: '/var/www/ghost',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
