import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { Request, Response, NextFunction } from 'express';
import { Server as HTTPServer } from 'http';

// Extend the Express Request type to include the io object
declare module 'express-serve-static-core' {
  interface Request {
    io?: SocketIOServer;
  }
}

let io: SocketIOServer | null = null;

export const socketMiddleware = (httpServer: HTTPServer) => {
  // Initialize Socket.IO and attach to the HTTP server
  io = new SocketIOServer(httpServer);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`, socket.request.headers);

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // Middleware to attach the io object to the request
  return (req: Request, res: Response, next: NextFunction) => {
    if (io) {
      req.io = io;
    }
    next();
  };
};
