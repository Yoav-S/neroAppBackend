import express from 'express';
import { logger } from '../utils/logger';
import { loginAsAGuest } from '../controllers/guestController';
const router = express.Router();

router.post('/loginAsAGuest', loginAsAGuest);

export default router;