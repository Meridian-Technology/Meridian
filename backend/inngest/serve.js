const { serve } = require('inngest/express');
const inngest = require('./client');
const functions = require('./functions');

// Create the serve handler for Inngest
const serveHandler = serve({
  client: inngest,
  functions: Object.values(functions),
  // Optional: Add middleware for authentication, logging, etc.
  middleware: [
    // Add any middleware you need here
  ],
});

module.exports = serveHandler;
