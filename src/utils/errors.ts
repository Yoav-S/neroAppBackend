import { Request, Response, NextFunction } from 'express';

// Define the types of errors your application can handle
export enum ErrorType {
    AUTHENTICATION,
    AUTHORIZATION,
    VALIDATION,
    NOT_FOUND,
    SERVER_ERROR,
    NETWORK_ERROR,
    INPUT_ERROR,
    EXTERNAL_SERVICE_ERROR,
    INTERNAL_SERVER_ERROR,
    DATABASE_ERROR,
    BUSINESS_LOGIC_ERROR,
    RATE_LIMIT_ERROR
}

// Define error codes for specific scenarios
export enum ErrorCode {
    // Authentication & Authorization
    MISSING_CREDENTIALS = 'MISSING_CREDENTIALS',
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
    USER_NOT_FOUND = 'USER_NOT_FOUND',
    INVALID_TOKEN = 'INVALID_TOKEN',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
    ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
    INVALID_PARTICIPANTS = 'INVALID_PARTICIPANTS',
    ADMIN_REQUIRED = 'ADMIN_REQUIRED',
    CHAT_NOT_FOUND = 'CHAT_NOT_FOUND',
    MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
    
    // Validation & Input
    INVALID_INPUT = 'INVALID_INPUT',
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
    INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
    INVALID_PASSWORD_FORMAT = 'INVALID_PASSWORD_FORMAT',
    USERNAME_TAKEN = 'USERNAME_TAKEN',
    EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
    
    // Database
    DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
    DATABASE_QUERY_ERROR = 'DATABASE_QUERY_ERROR',
    RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
    DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
    
    // External Services
    EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE',
    EXTERNAL_SERVICE_TIMEOUT = 'EXTERNAL_SERVICE_TIMEOUT',
    INVALID_API_KEY = 'INVALID_API_KEY',
    
    // Server Errors
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
    
    // Business Logic
    INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
    PRODUCT_OUT_OF_STOCK = 'PRODUCT_OUT_OF_STOCK',
    ORDER_ALREADY_PROCESSED = 'ORDER_ALREADY_PROCESSED',
    INVALID_COUPON = 'INVALID_COUPON',
    
    // Rate Limiting
    TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
    
    // File Operations
    FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',
    FILE_TOO_LARGE = 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
    
    // Miscellaneous
    FEATURE_NOT_IMPLEMENTED = 'FEATURE_NOT_IMPLEMENTED',
    MAINTENANCE_MODE = 'MAINTENANCE_MODE'
}

// Mapping of error codes to their details
// Mapping of error codes to their details
const errorDetails: Record<ErrorCode, { message: string, type: ErrorType }> = {
    // Authentication & Authorization
    [ErrorCode.MISSING_CREDENTIALS]: { 
        message: "Email and password are required", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.INVALID_CREDENTIALS]: { 
        message: "Invalid credentials", 
        type: ErrorType.AUTHENTICATION 
    },
    [ErrorCode.USER_NOT_FOUND]: { 
        message: "User not found", 
        type: ErrorType.NOT_FOUND 
    },
    [ErrorCode.INVALID_TOKEN]: { 
        message: "Invalid token", 
        type: ErrorType.AUTHENTICATION 
    },
    [ErrorCode.TOKEN_EXPIRED]: { 
        message: "Token has expired", 
        type: ErrorType.AUTHENTICATION 
    },
    [ErrorCode.INSUFFICIENT_PERMISSIONS]: { 
        message: "You don't have permission to perform this action", 
        type: ErrorType.AUTHORIZATION 
    },
    [ErrorCode.ACCOUNT_LOCKED]: { 
        message: "Account is locked", 
        type: ErrorType.AUTHENTICATION 
    },
    [ErrorCode.INVALID_PARTICIPANTS]: { 
        message: "Invalid participants for the chat", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.ADMIN_REQUIRED]: { 
        message: "Admin is required for group chats", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.CHAT_NOT_FOUND]: { 
        message: "Chat not found", 
        type: ErrorType.NOT_FOUND 
    },
    [ErrorCode.MESSAGE_NOT_FOUND]: { 
        message: "Message not found", 
        type: ErrorType.NOT_FOUND 
    },
    
    // Validation & Input
    [ErrorCode.INVALID_INPUT]: { 
        message: "Invalid input provided", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.MISSING_REQUIRED_FIELD]: { 
        message: "A required field is missing", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.INVALID_EMAIL_FORMAT]: { 
        message: "Invalid email format", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.INVALID_PASSWORD_FORMAT]: { 
        message: "Invalid password format", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.USERNAME_TAKEN]: { 
        message: "Username is already taken", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.EMAIL_ALREADY_REGISTERED]: { 
        message: "Email is already registered", 
        type: ErrorType.VALIDATION 
    },
    
    // Database
    [ErrorCode.DATABASE_CONNECTION_ERROR]: { 
        message: "Unable to connect to the database", 
        type: ErrorType.DATABASE_ERROR 
    },
    [ErrorCode.DATABASE_QUERY_ERROR]: { 
        message: "Error executing database query", 
        type: ErrorType.DATABASE_ERROR 
    },
    [ErrorCode.RECORD_NOT_FOUND]: { 
        message: "Requested record not found", 
        type: ErrorType.NOT_FOUND 
    },
    [ErrorCode.DUPLICATE_ENTRY]: { 
        message: "Duplicate entry not allowed", 
        type: ErrorType.DATABASE_ERROR 
    },
    
    // External Services
    [ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE]: { 
        message: "External service is currently unavailable", 
        type: ErrorType.EXTERNAL_SERVICE_ERROR 
    },
    [ErrorCode.EXTERNAL_SERVICE_TIMEOUT]: { 
        message: "External service request timed out", 
        type: ErrorType.EXTERNAL_SERVICE_ERROR 
    },
    [ErrorCode.INVALID_API_KEY]: { 
        message: "Invalid API key", 
        type: ErrorType.AUTHENTICATION 
    },
    
    // Server Errors
    [ErrorCode.INTERNAL_SERVER_ERROR]: { 
        message: "An unexpected error occurred", 
        type: ErrorType.SERVER_ERROR 
    },
    [ErrorCode.SERVICE_UNAVAILABLE]: { 
        message: "Service is currently unavailable", 
        type: ErrorType.SERVER_ERROR 
    },
    
    // Business Logic
    [ErrorCode.INSUFFICIENT_FUNDS]: { 
        message: "Insufficient funds to complete the transaction", 
        type: ErrorType.BUSINESS_LOGIC_ERROR 
    },
    [ErrorCode.PRODUCT_OUT_OF_STOCK]: { 
        message: "Product is out of stock", 
        type: ErrorType.BUSINESS_LOGIC_ERROR 
    },
    [ErrorCode.ORDER_ALREADY_PROCESSED]: { 
        message: "Order has already been processed", 
        type: ErrorType.BUSINESS_LOGIC_ERROR 
    },
    [ErrorCode.INVALID_COUPON]: { 
        message: "Invalid or expired coupon code", 
        type: ErrorType.BUSINESS_LOGIC_ERROR 
    },
    
    // Rate Limiting
    [ErrorCode.TOO_MANY_REQUESTS]: { 
        message: "Too many requests, please try again later", 
        type: ErrorType.RATE_LIMIT_ERROR 
    },
    
    // File Operations
    [ErrorCode.FILE_UPLOAD_ERROR]: { 
        message: "Error uploading file", 
        type: ErrorType.SERVER_ERROR 
    },
    [ErrorCode.FILE_TOO_LARGE]: { 
        message: "File size exceeds the maximum limit", 
        type: ErrorType.VALIDATION 
    },
    [ErrorCode.INVALID_FILE_TYPE]: { 
        message: "Invalid file type", 
        type: ErrorType.VALIDATION 
    },
    
    // Miscellaneous
    [ErrorCode.FEATURE_NOT_IMPLEMENTED]: { 
        message: "This feature is not yet implemented", 
        type: ErrorType.SERVER_ERROR 
    },
    [ErrorCode.MAINTENANCE_MODE]: { 
        message: "System is currently in maintenance mode", 
        type: ErrorType.SERVER_ERROR 
    }
};


// Custom error class extending the native Error class
export class AppError extends Error {
    type: ErrorType;
    userMessage: string;
    code: ErrorCode;

    constructor(code: ErrorCode) {
        const details = errorDetails[code];
        super(details.message);
        this.name = 'AppError';
        this.type = details.type;
        this.code = code;
        this.userMessage = getUserFriendlyMessage(details.type);

        Object.setPrototypeOf(this, AppError.prototype);
    }
}

// Function to create an instance of AppError
export function createAppError(code: ErrorCode): AppError {
    return new AppError(code);
}

// Helper function to map ErrorType to HTTP status codes
export function getStatusCodeForErrorType(errorType: ErrorType): number {
    switch (errorType) {
        case ErrorType.AUTHENTICATION:
            return 401;
        case ErrorType.AUTHORIZATION:
            return 403;
        case ErrorType.VALIDATION:
        case ErrorType.INPUT_ERROR:
            return 400;
        case ErrorType.NOT_FOUND:
            return 404;
        case ErrorType.SERVER_ERROR:
        case ErrorType.INTERNAL_SERVER_ERROR:
        case ErrorType.DATABASE_ERROR:
            return 500;
        case ErrorType.NETWORK_ERROR:
        case ErrorType.EXTERNAL_SERVICE_ERROR:
            return 503;
        default:
            return 500;
    }
}

// Function to get user-friendly error messages based on ErrorType
export function getUserFriendlyMessage(type: ErrorType): string {
    switch (type) {
        case ErrorType.AUTHENTICATION:
            return "Authentication failed. Please check your credentials and try again.";
        case ErrorType.AUTHORIZATION:
            return "You don't have permission to perform this action.";
        case ErrorType.VALIDATION:
            return "Some of the information you provided is not valid.";
        case ErrorType.NOT_FOUND:
            return "The requested information could not be found.";
        case ErrorType.SERVER_ERROR:
            return "There was a problem on our end. Please try again later.";
        case ErrorType.NETWORK_ERROR:
            return "There was a problem connecting to the server. Please check your internet connection.";
        case ErrorType.INPUT_ERROR:
            return "Please check the information you've entered and try again.";
        case ErrorType.EXTERNAL_SERVICE_ERROR:
            return "We're having trouble with one of our services. Please try again later.";
        case ErrorType.DATABASE_ERROR:
            return "There was an issue with the database. Please try again later.";
        default:
            return "An unexpected error occurred. Please try again.";
    }
}

// Error handler middleware
export const errorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof AppError) {
        res.status(getStatusCodeForErrorType(error.type)).json({ 
            success: false, 
            message: error.userMessage,
            code: error.code
        });
    } else {
        console.error('Unhandled error:', error);
        res.status(500).json({ 
            success: false, 
            message: "An unexpected error occurred. Please try again.",
            code: 'UNKNOWN_ERROR'
        });
    }
};

// Example usage in a route handler
export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw createAppError(ErrorCode.MISSING_CREDENTIALS);
        }

        // Simulating user lookup and password check
        const user = await findUserByEmail(email);
        if (!user) {
            throw createAppError(ErrorCode.USER_NOT_FOUND);
        }

        const isPasswordValid = await checkPassword(password, user.password);
        if (!isPasswordValid) {
            throw createAppError(ErrorCode.INVALID_CREDENTIALS);
        }

        // If everything is okay, send success response
        res.json({ success: true, message: "Login successful" });
    } catch (error) {
        next(error);
    }
};

// Helper functions (these would be implemented elsewhere in your actual application)
async function findUserByEmail(email: string) {
    // Implementation would depend on your database and ORM
    // This is just a placeholder
    return { email, password: 'hashed_password' };
}

async function checkPassword(inputPassword: string, storedPassword: string) {
    // Implementation would use a proper password hashing library
    // This is just a placeholder
    return inputPassword === 'correct_password';
}

// To use this error handling system in your Express app:
// app.use(errorHandler);