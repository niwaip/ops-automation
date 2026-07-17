const Redis = require('ioredis');
const fs = require('fs');
const redis = new Redis('redis://:redis_secret@localhost:6379');
redis.on('error', (err) => console.error('Redis Error:', err));
async function run() {
  try {
    const keys = await redis.keys('recorder_debug_session:*');
    if (keys.length > 0) {
        keys.sort();
        const latestKey = keys[keys.length - 1];
        console.log("Latest key:", latestKey);
        const session = await redis.get(latestKey);
        fs.writeFileSync('latest_session.json', session);
        console.log('Saved to latest_session.json');
    }
  } catch(err) {
    console.error('Run Error:', err);
  } finally {
    process.exit(0);
  }
}
run();
