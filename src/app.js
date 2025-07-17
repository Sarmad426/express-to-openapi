const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory database (array of objects)
let users = [
  { id: 1, name: "John Doe", email: "john@example.com", age: 30 },
  { id: 2, name: "Jane Smith", email: "jane@example.com", age: 25 },
  { id: 3, name: "Bob Johnson", email: "bob@example.com", age: 35 },
];

// Helper function to generate unique IDs
const generateId = () => {
  return users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;
};

// Routes

// GET /api/users - Get all users
app.get("/api/users", (req, res) => {
  res.json({
    success: true,
    data: users,
    count: users.length,
  });
});

// GET /api/users/:id - Get user by ID
app.get("/api/users/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.find((u) => u.id === id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({
    success: true,
    data: user,
  });
});

// POST /api/users - Create new user
app.post("/api/users", (req, res) => {
  const { name, email, age } = req.body;

  // Basic validation
  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "Name and email are required",
    });
  }

  // Check if email already exists
  const existingUser = users.find((u) => u.email === email);
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "Email already exists",
    });
  }

  const newUser = {
    id: generateId(),
    name,
    email,
    age: age || null,
  };

  users.push(newUser);

  res.status(201).json({
    success: true,
    data: newUser,
    message: "User created successfully",
  });
});

// PUT /api/users/:id - Update user
app.put("/api/users/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, email, age } = req.body;

  const userIndex = users.findIndex((u) => u.id === id);

  if (userIndex === -1) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Check if email already exists (excluding current user)
  if (email) {
    const existingUser = users.find((u) => u.email === email && u.id !== id);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }
  }

  // Update user
  const updatedUser = {
    ...users[userIndex],
    name: name || users[userIndex].name,
    email: email || users[userIndex].email,
    age: age !== undefined ? age : users[userIndex].age,
  };

  users[userIndex] = updatedUser;

  res.json({
    success: true,
    data: updatedUser,
    message: "User updated successfully",
  });
});

// DELETE /api/users/:id - Delete user
app.delete("/api/users/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const userIndex = users.findIndex((u) => u.id === id);

  if (userIndex === -1) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const deletedUser = users.splice(userIndex, 1)[0];

  res.json({
    success: true,
    data: deletedUser,
    message: "User deleted successfully",
  });
});

// GET /api/users/search - Search users by name or email
app.get("/api/users/search", (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      message: "Search query is required",
    });
  }

  const results = users.filter(
    (user) =>
      user.name.toLowerCase().includes(q.toLowerCase()) ||
      user.email.toLowerCase().includes(q.toLowerCase())
  );

  res.json({
    success: true,
    data: results,
    count: results.length,
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(
    `📊 API endpoints available at http://localhost:${PORT}/api/users`
  );
});

module.exports = app;
