import express from 'express';
import { getFeedPosts, getSimilarFeedPosts, createPost, getCategories, getCities, deletePost, reportPost } from '../controllers/homeController';
import  upload  from '../config/multer';
const router = express.Router();

router.get('/getFeedPosts', getFeedPosts);
router.post('/getSimilarFeedPosts', getSimilarFeedPosts);
router.get('/getCategories/:pageNumber', getCategories)
router.get('/getCities/:searchString', getCities);
router.post('/deletePost', deletePost);
router.post('/reportPost', reportPost);
router.post('/createPost', upload.array('imagesUrl', 10), createPost); // Adjust field name and limit as needed

export default router;