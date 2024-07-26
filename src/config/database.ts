import { MongoClient, ServerApiVersion } from 'mongodb';
import { logger } from '../utils/logger';
import { ENV } from './env';

let client: MongoClient;

export const initializeDatabase = async (): Promise<void> => {
  const uri = ENV.MONGODB_URI;

  if (!uri) {
    logger.error('MONGODB_URI is not defined in the environment variables');
    process.exit(1);
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    await client.db("neroDB").command({ ping: 1 });
    logger.info("Connected successfully to MongoDB");
  } catch (error) {
    logger.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

export const getDatabase = () => {
  if (!client) {
    throw new Error('Database not connected. Call initializeDatabase first.');
  }
  return client.db("neroDB"); // Specify the database name here
};

export const closeDatabaseConnection = async (): Promise<void> => {
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
  }
};