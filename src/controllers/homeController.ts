import { ObjectId } from 'mongodb';
import { Request, Response } from 'express';
import { getDatabase } from '../config/database';
import { AppError, ErrorCode, ErrorType, createAppError, getStatusCodeForErrorType, getUserFriendlyMessage } from '../utils/errors';
import { bucket } from '../config/firebaseConfig';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import { ENV } from '../config/env';


export const getFeedPosts = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const postsCollection = db.collection('posts');

    // Calculate the timestamp for the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Retrieve "Just published" posts from the last 24 hours, limited to the first 8 posts
    const justPublishedPosts = await postsCollection
      .find({ createdAt: { $gte: twentyFourHoursAgo } })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();

    // Retrieve "Technologies" posts based on keywords
    const technologyPosts = await getTechnologyPosts(postsCollection);

    // Retrieve "Pets" posts based on keywords
    const petPosts = await getPetPosts(postsCollection);

    // Structure the response
    const feedResponse = [
      {
        title: 'Just published',
        posts: justPublishedPosts,
      },
      {
        title: 'Technologies',
        posts: technologyPosts,
      },
      {
        title: 'Pets',
        posts: petPosts,
      },
    ];

    // Send the response
    res.status(200).json({
      success: true,
      message: 'Feed posts retrieved successfully',
      data: feedResponse,
    });
  } catch (error) {
    console.error('Error retrieving feed posts:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
};



// Main function to handle the request
export const getSimilarFeedPosts = async (req: Request, res: Response) => {
  try {
    const { keywords, postType, postId } = req.body;
    const db = getDatabase();
    const postsCollection = db.collection('posts');

    // Fetch posts with similar keywords and matching postType, excluding the one with postId
    const similarPosts = await getSimilarPosts(postsCollection, keywords, postType, postId);

    // Send response with posts array
    res.status(200).json({
      success: true,
      message: 'Similar feed posts retrieved successfully',
      posts: similarPosts,
    });
  } catch (error) {
    console.error('Error retrieving similar feed posts:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
};

export const deletePost = async (req: Request, res: Response) => {
  console.log('Received request to delete post'); // Initial log to confirm function execution

  const authHeader = req.headers.authorization;
  console.log('Authorization Header:', authHeader); // Log the Authorization header

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Authorization header missing or invalid'); // Log missing/invalid header
    throw createAppError(ErrorCode.INVALID_TOKEN);
  }

  try {
    // Extract and verify the token
    const token = authHeader.split(' ')[1];
    console.log('Extracted Token:', token); // Log the extracted token

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    console.log('Decoded Token User ID:', decodedToken.userId); // Log decoded user ID from token

    const { postId } = req.body;
    console.log('Request Body postId:', postId); // Log the postId from the request body

    const userId = decodedToken.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log('Invalid postId format'); // Log if postId is invalid
      throw createAppError(ErrorCode.RECORD_NOT_FOUND);
    }

    const db = getDatabase();
    const postsCollection = db.collection('posts');

    // Attempt to find the post by ID
    const post = await postsCollection.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(postId) });
    console.log('Post found in database:', post); // Log the post if found

    if (!post) {
      console.log('Post not found'); // Log if post not found
      throw createAppError(ErrorCode.RECORD_NOT_FOUND);
    }

    // Check if the user has permission to delete the post
    if (post.userId.toString() !== userId) {
      console.log('User does not have permission to delete this post'); // Log permission check failure
      throw createAppError(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    // Attempt to delete associated images from Firebase Storage
    if (post.imagesUrl && post.imagesUrl.length > 0) {
      console.log('Deleting associated images from Firebase Storage'); // Log image deletion attempt

      for (const imageUrl of post.imagesUrl) {
        const filePath = imageUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
        const file = bucket.file(filePath);

        try {
          await file.delete();
          console.log(`Deleted image: ${imageUrl}`); // Log successful image deletion
        } catch (error) {
          console.error(`Failed to delete image: ${imageUrl}`, error); // Log failed image deletion
        }
      }
    }

    // Attempt to delete the post from the database
    const deleteResult = await postsCollection.deleteOne({ _id: mongoose.Types.ObjectId.createFromHexString(postId) });
    console.log('Delete Result:', deleteResult); // Log delete result

    if (deleteResult.deletedCount === 0) {
      console.log('Post deletion failed'); // Log if no documents were deleted
      throw createAppError(ErrorCode.DATABASE_QUERY_ERROR);
    }

    console.log('Post deleted successfully'); // Log successful deletion
    res.status(200).json({ success: true, message: 'Post deleted successfully.' });
  } catch (error: any) {
    // Additional logging for different types of errors
    console.error('Error deleting post:', error);

    if (error instanceof AppError) {
      return res.status(getStatusCodeForErrorType(error.type)).json({
        success: false,
        message: error.userMessage,
      });
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      console.log('JWT Error:', error.message); // Log JWT errors specifically
      return res.status(403).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.AUTHENTICATION),
      });
    } else {
      console.log('Internal server error:', error.message); // Log unexpected errors
      return res.status(500).json({
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
      throw createAppError(ErrorCode.INVALID_TOKEN);
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
    const { postId } = req.body;
    const userId = decodedToken.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      throw createAppError(ErrorCode.RECORD_NOT_FOUND);
    }

    const db = getDatabase();
    const postsCollection = db.collection('posts');
    const usersCollection = db.collection('users');

    // Find the post by ID
    const post = await postsCollection.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(postId) });

    if (!post) {
      throw createAppError(ErrorCode.RECORD_NOT_FOUND);
    }

    // Find the user by ID to get their email
    const user = await usersCollection.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(userId) });

    if (!user || !user.email) {
      throw createAppError(ErrorCode.USER_NOT_FOUND);
    }

    // Set up email transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: ENV.EMAIL_USER,
        pass: ENV.EMAIL_PASS
      }
    });

    // Prepare email content
    const mailOptions = {
      from: ENV.EMAIL_USER, // Use the application's email as the sender
      to: ENV.EMAIL_SUPPORT,
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
      return res.status(403).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.AUTHENTICATION),
      });
    } else {
      console.error('Error reporting post:', error);
      return res.status(500).json({
        success: false,
        message: getUserFriendlyMessage(ErrorType.INTERNAL_SERVER_ERROR),
      });
    }
  }
};
export const createPost = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createAppError(ErrorCode.INVALID_TOKEN);
  }

  try {
    const { userId, postType, title, description, userFirstName, userLastName, location, city, keywords } = req.body;
    console.log('Request Body:', req.body);

    // Check for required fields
    if (!postType || !title || !description || !city) {
      return res.status(400).json({ success: false, message: 'postType, title, description, and city are required fields.' });
    }

    const images = req.files as Express.Multer.File[];
    console.log('Images:', images);

    const db = getDatabase();
    const userCollection = db.collection('users');
    const postsCollection = db.collection('posts');

    // Process keywords: If it's a string, split it into an array
    const keywordsArray = typeof keywords === 'string'
      ? keywords.split(',').map((keyword: string) => keyword.trim()) // Split by comma and trim spaces
      : [];

    // Create a new Post document
    const newPost: any = {
      userId: mongoose.Types.ObjectId.createFromHexString(userId),
      userFirstName,
      userLastName,
      postType,
      title,
      description,
      city, // Added city field
      keywords: keywordsArray, // Store keywords as an array of strings
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
      return res.status(500).json({ success: false, message: 'Failed to create post.' });
    }

    let imageUrls: string[] = [];

    // Handle image uploads
    if (images && images.length > 0) {
      for (const image of images) {
        const uniqueFilename = `${savedPost._id}/${image.originalname}`;
        const file = bucket.file(uniqueFilename);
        console.log('image.buffer', image.buffer);
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
    console.error('Error creating post:', error);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
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
  } catch (error) {
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};

export const getCities = async (req: Request, res: Response) => {
  console.log('arrived get cities');

  try {
    const db = getDatabase();
    const citiesCollection = db.collection('cities');

    const searchString = req.params.searchString as string;
    console.log('Search string received:', searchString);

    if (!searchString) {
      throw createAppError(ErrorCode.INVALID_INPUT);
    }

    const searchTerms = searchString.trim().toLowerCase().split(' ');
    const firstSearchLetter = searchTerms[0][0]; // Get the first letter of the first search term
    console.log('Search terms:', searchTerms);
    console.log('First search letter:', firstSearchLetter);

    const cityGroups = await citiesCollection.find({}).toArray();
    console.log('City groups retrieved:', cityGroups.length);

    let matchingCities: Array<{ name: string, startsWithSearchLetter: boolean }> = [];
    cityGroups.forEach((document, index) => {
      console.log(`Checking document ${index}`);
      if (document.cityGroups && Array.isArray(document.cityGroups)) {
        document.cityGroups.forEach(group => {
          if (group.cities && Array.isArray(group.cities)) {
            const groupMatches = group.cities.filter((city: { name: string; }) => {
              if (typeof city !== 'object' || !city.name || typeof city.name !== 'string') {
                console.log(`Warning: Invalid city object found:`, city);
                return false;
              }
              return searchTerms.every(term => 
                city.name.toLowerCase().includes(term)
              );
            }).map((city: { name: string; }) => ({
              ...city,
              startsWithSearchLetter: city.name.toLowerCase().startsWith(firstSearchLetter)
            }));
            console.log(`Found ${groupMatches.length} matches in group ${group.letter}`);
            matchingCities = matchingCities.concat(groupMatches);
          }
        });
      } else {
        console.log(`Document ${index} has no cityGroups or cityGroups is not an array`);
      }
    });

    // Sort the matching cities
    matchingCities.sort((a, b) => {
      if (a.startsWithSearchLetter && !b.startsWithSearchLetter) return -1;
      if (!a.startsWithSearchLetter && b.startsWithSearchLetter) return 1;
      return a.name.localeCompare(b.name); // Alphabetical order for ties
    });

    console.log('Total matching cities:', matchingCities.length);

    if (matchingCities.length === 0) {
      throw createAppError(ErrorCode.RECORD_NOT_FOUND);
    }

    console.log('Matching cities:', matchingCities);

    // Remove the startsWithSearchLetter property before sending the response
    const responseData = matchingCities.map(({ name }) => ({ name }));

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};


const getTechnologyPosts = async (postsCollection: any) => {
  const technologyKeywords = ['iPhone', 'Galaxy', 'AirPods', 'MacBook', 'iPad'];

  // Create a regex pattern that matches each keyword as a partial, case-insensitive match
  const keywordRegex = new RegExp(technologyKeywords.map(keyword => `${keyword}.*`).join('|'), 'i');

  // Query for posts containing at least one technology-related keyword as a partial match
  const technologyPosts = await postsCollection
    .find({ keywords: { $elemMatch: { $regex: keywordRegex } } })
    .sort({ createdAt: -1 }) // Sort by most recent first
    .limit(8) // Limit to 8 posts or adjust as needed
    .toArray();

  return technologyPosts;
};
const getPetPosts = async (postsCollection: any) => {
  const petKeywords = [
    'Pet', 'Dog', 'Cat', 'Animal', 
    'Puppy', 'Kitten', 'Bird',
    'Fish', 'Hamster', 'Rabbit',
    'Guinea pig', 'Parrot', 'Lizard',
    'Snake', 'Turtle', 'Ferret'
  ];

  // Create a regex pattern that matches each keyword as a partial, case-insensitive match
  const keywordRegex = new RegExp(petKeywords.map(keyword => `${keyword}.*`).join('|'), 'i');

  // Query for posts containing at least one pet-related keyword as a partial match
  const petPosts = await postsCollection
    .find({ keywords: { $elemMatch: { $regex: keywordRegex } } })
    .sort({ createdAt: -1 }) // Sort by most recent first
    .limit(8) // Limit to 8 posts
    .toArray();

  return petPosts;
};
const getSimilarPosts = async (
  postsCollection: any,
  keywords: string[],
  postType: string,
  postId: string
) => {
  // Create a regex pattern for the keywords to allow partial, case-insensitive matches
  const keywordRegex = new RegExp(keywords.map(keyword => `${keyword}.*`).join('|'), 'i');

  // Convert postId to ObjectId to match the MongoDB _id format
  const excludePostId = new ObjectId(postId);

  // Query posts with at least one matching keyword, the specified postType, and excluding the post with postId
  const similarPosts = await postsCollection
    .find({
      keywords: { $elemMatch: { $regex: keywordRegex } },
      postType,
      _id: { $ne: excludePostId }, // Exclude the post with the provided postId
    })
    .sort({ createdAt: -1 }) // Sort by most recent first
    .toArray();

  return similarPosts;
};

