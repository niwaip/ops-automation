const Redis = require('ioredis');
const redis = new Redis('redis://:redis_secret@localhost:6379');
redis.on('error', (err) => console.error('Redis Error:', err));
async function run() {
  try {
    const session = await redis.get('recorder_debug_session:recorder-debug-1784207296871');
    if (session === null) {
      console.log('SESSION IS NULL');
    } else {
      console.log(session);
    }
  } catch(err) {
    console.error('Run Error:', err);
  } finally {
    process.exit(0);
  }
}
run();
