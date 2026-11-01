const mongoose = require('mongoose');

// Next.js reloads code often and runs serverless, so the connection is kept on globalThis.
// Without this every request can open a new connection and Atlas runs out of them.
const cache = globalThis._intelliseatMongo || (globalThis._intelliseatMongo = { conn: null, promise: null });

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to .env.local (and to the Vercel project settings).');
  }

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, { bufferCommands: false })
      .then((m) => m)
      .catch((err) => {
        cache.promise = null; // let the next request try again
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

module.exports = connectDB;
