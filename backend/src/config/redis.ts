import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

export const redis = createClient({ url: process.env.REDIS_URL });

redis.on("error", (err) => console.error("Redis error:", err));

let connected = false;

export async function connectRedis() {
  if (!connected) {
    await redis.connect();
    connected = true;
  }
}
