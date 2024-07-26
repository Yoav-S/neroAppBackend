import multer from 'multer';

// Set up Multer to store files in memory
const storage = multer.memoryStorage();

// Create Multer instance
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});

export default upload;
