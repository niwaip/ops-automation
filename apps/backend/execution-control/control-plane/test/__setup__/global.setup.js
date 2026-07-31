module.exports = async function () {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://ops:ops_secret@localhost:5432/ops';
  }
};

