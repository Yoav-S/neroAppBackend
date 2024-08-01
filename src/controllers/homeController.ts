import { Request, Response } from 'express';
import { getDatabase } from '../config/database';
import { AppError, ErrorType, createAppError } from '../utils/errors';
import PostModel from '../models/Post';
import { bucket } from '../config/firebaseConfig';
import mongoose, { Mongoose } from 'mongoose';

export const getPostsPagination = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const postsCollection = db.collection('posts');
    const categoriesCollection = db.collection('categories');
    
    // Get the page and limit from the query parameters
    const page = parseInt(req.params.pageNumber as string, 10) || 1;
    const limit = 5;
    
    // Calculate the number of documents to skip
    const skip = (page - 1) * limit;
    
    // Retrieve the posts with pagination
    const posts = await postsCollection.find()
      .sort({ createdAt: -1 }) // Sort by creation date, most recent first
      .skip(skip)
      .limit(limit)
      .toArray(); // Convert cursor to array
    
    // Retrieve category names for each post
    const categoryIds = posts.map(post => post.category);
    const categories = await categoriesCollection.find({ _id: { $in: categoryIds } }).toArray();
    
    const categoryMap = new Map(categories.map(category => [category._id.toString(), category.name]));
    
    // Attach category names to posts
    const postsWithCategoryNames = posts.map(post => ({
      ...post,
      category: categoryMap.get(post.category.toString()) || 'Unknown' // Default to 'Unknown' if category not found
    }));
    
    // Get the total number of documents in the collection
    const totalPosts = await postsCollection.countDocuments();
    
    // Calculate the total number of pages
    const totalPages = Math.ceil(totalPosts / limit);
    const isMore: boolean = page !== totalPages;
    // Send the response with the posts and pagination info
    res.status(200).json({
      success: true,
      data: postsWithCategoryNames,
      pagination: {
        isMore,
        page,
        totalPages,
        totalPosts
      }
    });
  } catch (error) {
    console.error('Error retrieving posts:', error);
    res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
  }
};

export const createPost = async (req: Request, res: Response) => {
    console.log('arrived create post');
  
    try {
      const { userId, userFirstName, userLastName, postType, title, category: categoryName, description, location } = req.body;
      console.log('Request Body:', req.body);
  
      const images = req.files as Express.Multer.File[];
      console.log('Images:', images);
  
      // Check if category exists or create a new one
      const db = getDatabase();
      const categoriesCollection = db.collection('categories');
      let category = await categoriesCollection.findOne({ name: categoryName });
      console.log('Category:', category);
  
      if (!category) {
        const result = await categoriesCollection.insertOne({ name: categoryName });
        category = result.insertedId ? { _id: result.insertedId } : null;
        console.log('New Category Created:', category);
      }
  
      if (!category) {
        return res.status(500).json({ success: false, message: 'Failed to create or find category.' });
      }
  
      // Create a new Post document
      const newPost = {
        userId: mongoose.Types.ObjectId.createFromHexString(userId),
        userFirstName,
        userLastName,
        postType,
        title,
        category: category._id,
        description,
        imagesUrl: [] as string[],
        location,
        createdAt: new Date(),
        updatedAt: new Date()
      };
  
      // Insert the new post
      const postsCollection = db.collection('posts');
      const result = await postsCollection.insertOne(newPost);
      const savedPost = result.insertedId ? { _id: result.insertedId, ...newPost } : null;
  
      if (!savedPost) {
        return res.status(500).json({ success: false, message: 'Failed to create post.' });
      }
  
      let imageUrls: string[] = [];
  
      // Handle image uploads
      if (images && images.length > 0) {
        for (const image of images) {
          const uniqueFilename = `${savedPost._id}/${image.originalname}`;
          const file = bucket.file(uniqueFilename);
          await file.save(image.buffer, {
            metadata: {
              contentType: image.mimetype,
            },
            public: true,
          });
  
          const fileUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
          imageUrls.push(fileUrl);
        }
        res.status(200).json({images: imageUrls});
        // Update the post with the image URLs
        await postsCollection.updateOne(
          { _id: savedPost._id },
          { $set: { imagesUrl: imageUrls } }
        );
  
        savedPost.imagesUrl = imageUrls;
      }
  
      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        post: savedPost
      });
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
    }
};
export const getCategories = async (req: Request, res: Response) => {
  console.log('arrived get categories');
  
  try {
    const db = getDatabase();
    const categoriesCollection = db.collection('categories');
    
    // Get the pageNumber from query parameters
    const pageNumber = parseInt(req.params.pageNumber as string, 10) || 0;
    const limit = 8; // Number of categories per page

    // Calculate the number of documents to skip
    const skip = pageNumber * limit;

    // Retrieve the categories with pagination
    const categories = await categoriesCollection.find()
      .skip(skip)
      .limit(limit)
      .toArray(); // Convert cursor to array
    console.log(categories);
    
    // Get the total number of documents in the collection
    const totalCategories = await categoriesCollection.countDocuments();

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalCategories / limit);

    // Check if there are more categories
    const isMore = (pageNumber + 1) * limit < totalCategories;

    // Send the response with categories and pagination info
    res.status(200).json({
      success: true,
      data: categories,
      pagination: {
        page: pageNumber,
        isMore,
        totalPages,
        totalItems: totalCategories
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};

