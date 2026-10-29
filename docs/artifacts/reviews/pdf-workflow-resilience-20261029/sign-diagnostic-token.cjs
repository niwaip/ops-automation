const crypto = require('crypto');
const user = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const exp = String(Math.floor(Date.now()/1000)+180);
const secret = process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
if (!secret) process.exit(1);
const signature = crypto.createHmac('sha256',secret).update(`${user}:${exp}`).digest('base64url');
process.stdout.write(`sandbox-user-token-${user}.${exp}.${signature}\n`);
