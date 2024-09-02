import { Express } from 'express';
import authRoutes from './authRoutes';
import guestRoutes from './guestRoutes'
import homeRoutes from './homeRoutes';
import chatRoutes from './chatRoutes';

export const configureRoutes = (app: Express) => {
  
  app.use('/auth', authRoutes);
  app.use('/guest', guestRoutes); // Add this line
  app.use('/home', homeRoutes); // Add this line
  app.use('/chat', chatRoutes); // Add this line
};