import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/green_node',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  useInMemoryDb: process.env.USE_IN_MEMORY_DB === 'true'
};
