import * as admin from 'firebase-admin';
import { ENV } from '../config/env'; // Import your environment variables
import * as dotenv from 'dotenv';
dotenv.config();

// Parse the service account key from the environment variable
const serviceAccount = JSON.parse(ENV.FIREBASE_SERVICE_ACCOUNT_KEY as string);
console.log('Service Account Key:', ENV.FIREBASE_SERVICE_ACCOUNT_KEY);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  storageBucket: ENV.FIREBASE_BUCKET_NAME // Your bucket name
});

// Create a reference to the storage bucket
const bucket = admin.storage().bucket();

const testFirebaseConnection = async () => {
  try {
    // Check if the bucket is accessible
    const [files] = await bucket.getFiles();
    console.log('Files in bucket:', files.length);
  } catch (error) {
    console.error('Failed to access Firebase bucket:', error);
  }
};

testFirebaseConnection();
export { bucket };
