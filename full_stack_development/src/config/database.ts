import mongoose from 'mongoose';
import { config } from './env.js';

let mongodInstance: any = null;

export async function connectDatabase(): Promise<string> {
  // If explicitly requested or on fallback
  if (config.useInMemoryDb) {
    return startInMemoryMongo();
  }

  try {
    console.log(`🔌 Attempting connection to MongoDB at: ${config.mongoUri}`);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 3000 // 3 seconds timeout for fast fallback
    });
    console.log('✅ Connected to MongoDB successfully.');
    return config.mongoUri;
  } catch (err: any) {
    console.warn(`⚠️ Could not connect to primary MongoDB (${err.message}).`);
    
    // In development mode, automatically spin up an in-memory MongoDB instance for zero-friction setup
    if (config.nodeEnv !== 'production') {
      console.log('🚀 Launching built-in In-Memory MongoDB server for instant local development...');
      return startInMemoryMongo();
    } else {
      throw err;
    }
  }
}

async function startInMemoryMongo(): Promise<string> {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongodInstance = await MongoMemoryServer.create({
      instance: {
        dbName: 'green_node'
      }
    });
    const uri = mongodInstance.getUri();
    await mongoose.connect(uri);
    console.log(`✅ In-Memory MongoDB active at: ${uri}`);
    console.log('💡 Tip: To persist data across restarts, start MongoDB or Docker (docker compose up -d) or configure MONGODB_URI.');
    return uri;
  } catch (memErr: any) {
    console.error('❌ Failed to start in-memory MongoDB:', memErr.message);
    throw memErr;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
  console.log('🔌 Disconnected from MongoDB.');
}
