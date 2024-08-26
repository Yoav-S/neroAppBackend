import mongoose, { Document, Schema } from 'mongoose';

export interface IPost extends Document {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  userFirstName: string;
  userLastName: string;
  postType: 'Lost' | 'Found';
  title: string;
  userProfilePicture?: string;
  description: string;
  imagesUrl?: string[];
  location?: {
    country?: string;
    city?: string;
    street?: string;
    number?: string;
  };
}

const LocationSchema: Schema = new Schema({
  country: { type: String },
  city: { type: String },
  district: { type: String },
  street: { type: String },
  number: { type: String }
}, { _id: false });

const PostSchema: Schema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  userFirstName: { type: String },
  userLastName: { type: String },
  userProfilePicture: { type: String },
  postType: { type: String, enum: ['Lost', 'Found'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  imagesUrl: { type: [String], default: [] },
  location: { type: LocationSchema }
});

const PostModel = mongoose.model<IPost>('Post', PostSchema);
export default PostModel;