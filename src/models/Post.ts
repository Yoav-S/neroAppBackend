import mongoose, { Document, Schema } from 'mongoose';

// Define the interface for the Post document
export interface IPost extends Document {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  userFirstName: string;
  userLastName: string;
  postType: 'Lost' | 'Found';
  title: string;
  category: mongoose.Types.ObjectId;
  userProfilePicture: string;
  description: string;
  imagesUrl?: string[];
  location: {
    country: string;
    city: string;
    street?: string;
    number?: string;
  };
}

// Define the schema for the Post model
const LocationSchema: Schema = new Schema({
  country: { type: String, required: true },
  city: { type: String, required: true },
  street: { type: String },
  number: { type: String }
}, { _id: false });

const PostSchema: Schema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  userFirstName: { type: String, required: true },
  userLastName: { type: String, required: true },
  userProfilePicture: {type: String, required: true},
  postType: { type: String, enum: ['Lost', 'Found'], required: true },
  title: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  description: { type: String, required: true },
  imagesUrl: { type: [String], default: [] },
  location: { type: LocationSchema, required: true }
});

// Create and export the model
const PostModel = mongoose.model<IPost>('Post', PostSchema);
export default PostModel;
