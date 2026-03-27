class ApiError extends Error {
    constructor({ statusCode, code, message, details = null }) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

class BadRequestError extends ApiError {
    constructor(message, details = null) {
        super({
            statusCode: 400,
            code: "bad_request",
            message,
            details,
        });
    }
}

class NotFoundError extends ApiError {
    constructor(message, details = null) {
        super({
            statusCode: 404,
            code: "not_found",
            message,
            details,
        });
    }
}

class ValidationError extends ApiError {
    constructor(message, details = null) {
        super({
            statusCode: 422,
            code: "validation_error",
            message,
            details,
        });
    }
}

module.exports = {
    ApiError,
    BadRequestError,
    NotFoundError,
    ValidationError,
};
