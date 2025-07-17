const express = require('express');
const router = express.Router();

// Define your routes here
router.get('/', (req, res) => {
    res.send('Welcome to the Express app!');
});

// Export the router
module.exports = router;