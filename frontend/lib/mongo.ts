import { MongoClient } from "mongodb";

declare global {
  var _mongoClient: MongoClient | undefined;
}

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB ?? "arcfun";

export async function getDb() {
  if (!globalThis._mongoClient) {
    globalThis._mongoClient = new MongoClient(uri);
    await globalThis._mongoClient.connect();
  }
  return globalThis._mongoClient.db(dbName);
}
