import { Request, Response } from 'express';
import { getDatabase } from '../config/database';
import { AppError, ErrorType, createAppError } from '../utils/errors';
import { bucket } from '../config/firebaseConfig';
import mongoose from 'mongoose';
import { Filters } from '../utils/interfaces';
import { createFilterQuery } from '../utils/functions';
export const getPostsPagination = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const postsCollection = db.collection('posts');
    const categoriesCollection = db.collection('categories');
    console.log(req.body);

    // Destructure and provide default value for filters
    const { pageNumber = 0, filters = {}} = req.body;
    console.log(filters);

    const page = parseInt(pageNumber as string, 10) || 0;
    const limit = 5;

    // Create filter query, handle undefined filters by passing an empty object
    const filterQuery = await createFilterQuery(filters, categoriesCollection);

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

    // Retrieve category names for each post
    const categoryIds = postsForCurrentPage.map(post => post.category);
    const categories = await categoriesCollection.find({ _id: { $in: categoryIds } }).toArray();

    const categoryMap = new Map(categories.map(category => [category._id.toString(), category.name]));

    // Attach category names to posts
    const postsWithCategoryNames = postsForCurrentPage.map(post => ({
      ...post,
      category: categoryMap.get(post.category.toString()) || 'Unknown'
    }));

    const isMore: boolean = (page + 1) * limit < totalPosts;

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
    const userCollection = db.collection('users');
    const categoriesCollection = db.collection('categories');
    let category = await categoriesCollection.findOne({ name: categoryName });

    if (!category) {
      const result = await categoriesCollection.insertOne({ name: categoryName });
      category = result.insertedId ? { _id: result.insertedId } : null;
    }

    if (!category) {
      return res.status(500).json({ success: false, message: 'Failed to create or find category.' });
    }

    let requiredUser = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      requiredUser = await userCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
    } else {
      requiredUser = await userCollection.findOne({ userId: userId });
    }
    console.log('Required User:', requiredUser);
    
    // Create a new Post document
    const newPost = {
      userId: mongoose.Types.ObjectId.createFromHexString(userId),
      userFirstName,
      userLastName,
      postType,
      title,
      category: category._id,
      userProfilePicture: requiredUser?.picture,
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

    // Retrieve only the category names with pagination
    const categories = await categoriesCollection.find({}, { projection: { name: 1, _id: 0 } }) // Select only the 'name' field
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
    console.error('Error fetching categories:', error);
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
      throw createAppError("Search string is required.", ErrorType.VALIDATION);
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
      throw createAppError("No cities found matching the search criteria.", ErrorType.NOT_FOUND);
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


