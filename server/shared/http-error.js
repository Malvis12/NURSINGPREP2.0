"use strict";

// Standard HTTP error carrying a status code for centralized error responders.
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { HttpError };
