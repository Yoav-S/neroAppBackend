import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';  // Import Socket.IO
import { configureRoutes } from './src/routes';
import { logger } from './src/utils/logger';
import { closeDatabaseConnection, initializeDatabase } from './src/config/database';
import './src/config/firebaseConfig'; // Import to initialize Firebase and log
import { ENV } from './src/config/env';
import { socketHandler } from './src/utils/socket';


dotenv.config();

const app = express();
const httpServer = createServer(app);  // Create HTTP server
const port = ENV.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Initialize Socket.IO and pass the httpServer to it
const io = new Server(httpServer, {
  cors: {
    origin: '*',  // Allow all origins (adjust for production)
    methods: ['GET', 'POST'],
  },
});

// Use the socket handler
socketHandler(io);

// Routes
configureRoutes(app);

// Start the server and connect to the database
const startServer = async () => {
  try {
    await initializeDatabase();
    httpServer.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start the server:', error);
    process.exit(1);
  }
};

startServer().catch((error) => {
  logger.error('Unhandled error during server startup:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await closeDatabaseConnection();
  process.exit(0);
});

export default app;
