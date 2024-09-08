import express from 'express';
import { getUserChats, getChatMessages } from '../controllers/chatController';
import  upload  from '../config/multer';

const router = express.Router();

router.post('/getUserChats', getUserChats);
router.post ('/getChatMessages', getChatMessages)
export default router;