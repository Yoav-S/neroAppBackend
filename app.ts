import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';  // Import this to create a server for both Express and Socket.IO
import { Server } from 'socket.io';   // Import Socket.IO Server
import { configureRoutes } from './src/routes';
import { logger } from './src/utils/logger';
import { closeDatabaseConnection, initializeDatabase } from './src/config/database';
import './src/config/firebaseConfig'; // Import to initialize Firebase and log
import { ENV } from './src/config/env';

dotenv.config();

const app = express();
const port = ENV.PORT || 3000;

// Create HTTP server for Express and Socket.IO
const httpServer = createServer(app);  // This will serve both HTTP and Socket.IO connections
const io = new Server(httpServer, {
  cors: {
    origin: '*',   // Adjust as per your frontend origin
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Routes
configureRoutes(app);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected: ', socket.id);

  // Listen for incoming messages
  socket.on('sendMessage', (message) => {
    console.log('Received message: ', message);
    io.emit('receiveMessage', message);  // Broadcast to all connected clients
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected: ', socket.id);
  });
});

// Start the server and connect to the database
const startServer = async () => {
  try {
    await initializeDatabase(); // Use the new function name
    httpServer.listen(port, () => {  // Use httpServer instead of app.listen
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
