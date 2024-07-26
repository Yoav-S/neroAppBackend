import { Express } from 'express';
import authRoutes from './authRoutes';
import guestRoutes from './guestRoutes'
import homeRoutes from './homeRoutes';
export const configureRoutes = (app: Express) => {
  
  app.use('/auth', authRoutes);
  app.use('/guest', guestRoutes); // Add this line
  app.use('/home', homeRoutes); // Add this line

};