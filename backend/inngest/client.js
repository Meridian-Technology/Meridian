const { Inngest } = require('inngest');

// Initialize the Inngest client
const inngest = new Inngest({
  id: 'meridian-backend',
  name: 'Meridian Backend',
  // In development, this will connect to your local Inngest dev server
  // In production, you'll need to set the INNGEST_EVENT_KEY environment variable
  eventKey: process.env.INNGEST_EVENT_KEY,
});

module.exports = inngest;
