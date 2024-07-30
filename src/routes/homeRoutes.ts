import express from 'express';
import { getPostsPagination, createPost, getCategories } from '../controllers/homeController';
import  upload  from '../config/multer';
const router = express.Router();

router.get('/getPostsPagination', getPostsPagination);
router.get('/getCategories/:pageNumber', getCategories)
router.post('/createPost', upload.array('imagesUrl', 10), createPost); // Adjust field name and limit as needed

export default router;