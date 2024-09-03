import express from 'express';
import { getUserChats } from '../controllers/chatController';
import  upload  from '../config/multer';

const router = express.Router();

router.post('/getUserChats', getUserChats);

export default router;