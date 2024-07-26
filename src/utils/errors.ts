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
    INTERNAL_SERVER_ERROR, // Add this
    DatabaseError
  }

// Custom error class extending the native Error class
export class AppError extends Error {
    type: ErrorType;
    userMessage: string;

    constructor(message: string, type: ErrorType) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.userMessage = getUserFriendlyMessage(type);

        // Ensure proper inheritance
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

// Function to create an instance of AppError
export function createAppError(message: string, type: ErrorType): AppError {
    return new AppError(message, type);
}

// Function to get user-friendly error messages based on ErrorType
export function getUserFriendlyMessage(type: ErrorType): string {
    switch (type) {
        case ErrorType.AUTHENTICATION:
            return "Oops! Email or password incorrect Please, try another one.";
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
        default:
            return "An unexpected error occurred. Please try again.";
    }
}
