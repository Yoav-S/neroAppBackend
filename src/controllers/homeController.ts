import { Request, Response } from 'express';
import { getDatabase } from '../config/database';
import { AppError, ErrorType, createAppError, getStatusCodeForErrorType, getUserFriendlyMessage } from '../utils/errors';
import { bucket } from '../config/firebaseConfig';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import { createFilterQuery } from '../utils/functions';
export const getPostsPagination = async (req: Request, res: Response) => {
  try {
    const db = getDatabase(); // Assuming getDatabase is available
    const postsCollection = db.collection('posts');
    const categoriesCollection = db.collection('categories');
    console.log(req.body);

    // Destructure and provide default values
    const { pageNumber = 0, filters = null } = req.body;
    console.log(filters);

    const page = parseInt(pageNumber as string, 10) || 0;
    const limit = 5;

    let filterQuery = {};

    // Only create filter query if filters are not null
    if (filters !== null) {
      filterQuery = await createFilterQuery(filters, categoriesCollection);
    }

    // Get the total number of documents that match the filter
    const totalPosts = await postsCollection.countDocuments(filterQuery);

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalPosts / limit);

    // Calculate the number of documents to skip
    const skip = page * limit;

    // Retrieve posts that match the filter with pagination
    const postsForCurrentPage = await postsCollection.find(filterQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const isMore: boolean = (page + 1) * limit < totalPosts;

    // Send the response with the posts and pagination info
    res.status(200).json({
      success: true,
      data: postsForCurrentPage,
      pagination: {
        isMore,
        page,
        totalPages,
        totalPosts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: getUserFriendlyMessage(ErrorType.INTERNAL_SERVER_ERROR)
    });
  }
};


export const deletePost = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  try {
    // Validate Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createAppError('Access token is missing or invalid.', ErrorType.AUTHENTICATION);
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    const { postId } = req.body;
    const userId = decodedToken.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      throw createAppError('Invalid post ID.', ErrorType.VALIDATION);
    }

    const db = getDatabase(); // Assuming `getDatabase` is available
    const postsCollection = db.collection('posts');

    // Find the post by ID
    const post = await postsCollection.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(postId) });

    if (!post) {
      throw createAppError('Post not found.', ErrorType.NOT_FOUND);
    }

    // Validate if the user has permission to delete the post
    if (post.userId.toString() !== userId) {
      throw createAppError('Unauthorized action.', ErrorType.AUTHORIZATION);
    }

    // Delete associated images from Firebase Storage
    if (post.imagesUrl && post.imagesUrl.length > 0) {
      for (const imageUrl of post.imagesUrl) {
        const filePath = imageUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
        const file = bucket.file(filePath);

        try {
          await file.delete();
        } catch (error) {
          console.error(`Failed to delete image: ${imageUrl}`, error);
          // Consider whether this should throw an error or just log it
        }
      }
    }

    // Delete the post from the collection
    const deleteResult = await postsCollection.deleteOne({ _id: mongoose.Types.ObjectId.createFromHexString(postId) });

    if (deleteResult.deletedCount === 0) {
      throw createAppError('Failed to delete the post.', ErrorType.DatabaseError);
    }

    res.status(200).json({ success: true, message: 'Post deleted successfully.' });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(getStatusCodeForErrorType(error.type)).json({
        success: false,
        message: error.userMessage,
      });
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(getStatusCodeForErrorType(ErrorType.AUTHENTICATION)).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.AUTHENTICATION),
      });
    } else {
      return res.status(getStatusCodeForErrorType(ErrorType.INTERNAL_SERVER_ERROR)).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.INTERNAL_SERVER_ERROR),
      });
    }
  }
};



export const reportPost = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  try {
    // Validate Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createAppError('Access token is missing or invalid.', ErrorType.AUTHENTICATION);
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    const { postId } = req.body;
    const userId = decodedToken.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      throw createAppError('Invalid post ID.', ErrorType.VALIDATION);
    }

    const db = getDatabase();
    const postsCollection = db.collection('posts');
    const usersCollection = db.collection('users');

    // Find the post by ID
    const post = await postsCollection.findOne({ _id: new mongoose.Types.ObjectId(postId) });

    if (!post) {
      throw createAppError('Post not found.', ErrorType.NOT_FOUND);
    }

    // Find the user by ID to get their email
    const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });

    if (!user || !user.email) {
      throw createAppError('User not found or email not available.', ErrorType.NOT_FOUND);
    }

    // Set up email transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Prepare email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_SUPPORT,
      subject: 'Post Report',
      text: `A post has been reported.\n\nPost ID: ${postId}\nReported by User ID: ${userId}\nReporter's Email: ${user.email}`,
      html: `<h2>Post Report</h2><p>A post has been reported.</p><p><strong>Post ID:</strong> ${postId}</p><p><strong>Reported by User ID:</strong> ${userId}</p><p><strong>Reporter's Email:</strong> ${user.email}</p>`
    };

    // Send the email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: 'Post reported successfully.' });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(getStatusCodeForErrorType(error.type)).json({
        success: false,
        message: error.userMessage,
      });
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(getStatusCodeForErrorType(ErrorType.AUTHENTICATION)).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.AUTHENTICATION),
      });
    } else {
      return res.status(getStatusCodeForErrorType(ErrorType.INTERNAL_SERVER_ERROR)).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.INTERNAL_SERVER_ERROR),
      });
    }
  }
};
export const createPost = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(getStatusCodeForErrorType(ErrorType.AUTHENTICATION))
      .json({ success: false, message: 'Access token is missing or invalid.' });
  }

  try {
    const { userId, postType, title, description, userFirstName, userLastName, location } = req.body;
    console.log('Request Body:', req.body);

    // Check for required fields
    if (!postType || !title || !description) {
      throw createAppError('postType, title, and description are required fields.', ErrorType.VALIDATION);
    }

    const images = req.files as Express.Multer.File[];
    console.log('Images:', images);

    const db = getDatabase();
    const userCollection = db.collection('users');
    const postsCollection = db.collection('posts');

    // Create a new Post document
    const newPost: any = {
      userId: mongoose.Types.ObjectId.createFromHexString(userId),
      userFirstName: userFirstName,
      userLastName: userLastName,
      postType,
      title,
      description,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    if (location) newPost.location = location;

    // Get user profile picture if available
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const requiredUser = await userCollection.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(userId) });
      if (requiredUser?.picture) newPost.userProfilePicture = requiredUser.picture;
    }

    // Insert the new post
    const result = await postsCollection.insertOne(newPost);
    const savedPost = result.insertedId ? { _id: result.insertedId, ...newPost } : null;

    if (!savedPost) {
      throw createAppError('Failed to create post.', ErrorType.INTERNAL_SERVER_ERROR);
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
    const appError = error instanceof AppError ? error : createAppError('An unexpected error occurred.', ErrorType.INTERNAL_SERVER_ERROR);
    res.status(getStatusCodeForErrorType(appError.type)).json({ success: false, message: appError.userMessage });
  }
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const categoriesCollection = db.collection('categories');
    
    // Get the pageNumber from query parameters
    const pageNumber = parseInt(req.params.pageNumber as string, 10) || 0;
    const limit = 8; // Number of categories per page

    // Calculate the number of documents to skip
    const skip = pageNumber * limit;

    // Retrieve only the category names with pagination
    const categories = await categoriesCollection.find({}, { projection: { name: 1, _id: 0 } }) // Select only the 'name' field
      .skip(skip)
      .limit(limit)
      .toArray(); // Convert cursor to array

    // Get the total number of documents in the collection
    const totalCategories = await categoriesCollection.countDocuments();

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalCategories / limit);

    // Check if there are more categories
    const isMore = (pageNumber + 1) * limit < totalCategories;

    // Send the response with category names and pagination info
    res.status(200).json({
      success: true,
      data: categories.map(category => category.name), // Extract just the names as strings
      pagination: {
        page: pageNumber,
        isMore,
        totalPages,
        totalItems: totalCategories
      }
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(getStatusCodeForErrorType(error.type)).json({
        success: false,
        message: error.userMessage
      });
    } else {
      res.status(500).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.INTERNAL_SERVER_ERROR)
      });
    }
  }
};

export const getCities = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const citiesCollection = db.collection('cities');

    const searchString = req.params.searchString as string;

    if (!searchString) {
      throw createAppError("Search string is required.", ErrorType.VALIDATION);
    }

    const searchTerms = searchString.trim().toLowerCase().split(' ');
    const firstSearchLetter = searchTerms[0][0]; // Get the first letter of the first search term

    const cityGroups = await citiesCollection.find({}).toArray();

    let matchingCities: Array<{ name: string, startsWithSearchLetter: boolean }> = [];
    cityGroups.forEach((document) => {
      if (document.cityGroups && Array.isArray(document.cityGroups)) {
        document.cityGroups.forEach(group => {
          if (group.cities && Array.isArray(group.cities)) {
            const groupMatches = group.cities.filter((city: { name: string; }) => {
              if (typeof city !== 'object' || !city.name || typeof city.name !== 'string') {
                return false;
              }
              return searchTerms.every(term => 
                city.name.toLowerCase().includes(term)
              );
            }).map((city: { name: string; }) => ({
              ...city,
              startsWithSearchLetter: city.name.toLowerCase().startsWith(firstSearchLetter)
            }));
            matchingCities = matchingCities.concat(groupMatches);
          }
        });
      }
    });

    // Sort the matching cities
    matchingCities.sort((a, b) => {
      if (a.startsWithSearchLetter && !b.startsWithSearchLetter) return -1;
      if (!a.startsWithSearchLetter && b.startsWithSearchLetter) return 1;
      return a.name.localeCompare(b.name); // Alphabetical order for ties
    });

    if (matchingCities.length === 0) {
      throw createAppError("No cities found matching the search criteria.", ErrorType.NOT_FOUND);
    }

    // Remove the startsWithSearchLetter property before sending the response
    const responseData = matchingCities.map(({ name }) => ({ name }));

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(getStatusCodeForErrorType(error.type)).json({
        success: false,
        message: error.userMessage
      });
    } else {
      res.status(500).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.INTERNAL_SERVER_ERROR)
      });
    }
  }
};


