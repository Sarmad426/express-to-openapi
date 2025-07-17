# Express to OpenAPI

🚀 **A powerful CLI tool that automatically generates accurate OpenAPI 3.0 specifications from Express.js applications with intelligent code analysis.**

## Why This Tool?

Traditional OpenAPI generators make assumptions about your API. This tool **analyzes your actual Express.js code** to generate specifications that match your real implementation - including correct status codes, proper schemas, and accurate parameter types.

## Key Features

- 🔍 **Deep Code Analysis**: Parses Express.js route handlers using AST analysis
- 📊 **Accurate Status Codes**: Detects actual HTTP status codes used in `res.status()` calls
- 🎯 **Smart Parameter Detection**: Automatically identifies path, query, and body parameters
- 🏷️ **Intelligent Type Inference**: Infers correct data types (string, integer, boolean)
- 📝 **Multiple Output Formats**: Supports both JSON and YAML output
- ✨ **Schema Generation**: Creates request/response schemas from actual code usage
- 🔧 **Router Pattern Support**: Works with both `app.get()` and `router.get()` patterns
- 📦 **ES6 Module Support**: Handles modern JavaScript imports and exports

## Installation

### Global Installation (Required)

```bash
npm install -g express-to-openapi
```

> **Note**: This is a CLI tool designed for global installation. Local installation is not supported.

### Alternative: One-time Usage (No Installation)

```bash
npx express-to-openapi <path-to-app.js> [json|yaml]
```

## Quick Start

```bash
# 1. Install globally
npm install -g express-to-openapi

# 2. Generate OpenAPI spec
express-to-openapi src/app.js

# 3. View generated specification
cat openapi.json
```

## Usage

### Basic Commands

```bash
# Generate JSON specification (default)
express-to-openapi src/app.js

# Generate YAML specification
express-to-openapi src/app.js yaml

# Using npx (no installation required)
npx express-to-openapi src/app.js json
```

### Example Output

```bash
🔍 Analyzing Express.js application...
✅ OpenAPI spec generated at: /path/to/your/project/openapi.json
📊 Found 4 route(s)

📋 Detected routes:
  GET / (0 params)
  POST / (1 params)
  PATCH /{id} (1 params)
  DELETE /{id} (1 params)
```

## What Makes This Tool Accurate

### ✅ **Correct Status Codes**
- Analyzes actual `res.status()` calls in your code
- Only includes status codes that are actually used
- Detects error handling patterns in try/catch blocks

### ✅ **Enhanced Parameter Detection**
- **Path Parameters**: Converts `:id` to `{id}` format
- **Query Parameters**: Detects `req.query.param` usage
- **Request Body**: Analyzes `req.body` and destructuring patterns
- **Type Inference**: Recognizes `completed` as boolean, `age` as integer, etc.

### ✅ **Intelligent Schema Generation**
- Examines `res.json()` calls to infer response structures
- Recognizes MongoDB/Mongoose patterns
- Distinguishes between arrays and single objects
- Infers property types from usage patterns

## Example: Todo API

### Input: Express.js Route

```javascript
import { Router } from 'express';
import Todo from '../models/Todo.js';

const router = Router();

// GET all todos
router.get('/', async (req, res) => {
  try {
    const todos = await Todo.find();
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new todo
router.post('/', async (req, res) => {
  const { title } = req.body;
  const todo = new Todo({ title });
  
  try {
    const newTodo = await todo.save();
    res.status(201).json(newTodo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH a todo by ID
router.patch('/:id', async (req, res) => {
  const { completed } = req.body;
  
  try {
    const updatedTodo = await Todo.findByIdAndUpdate(
      req.params.id,
      { completed },
      { new: true }
    );
    
    if (!updatedTodo) {
      return res.status(404).json({ message: 'Todo not found' });
    }
    
    res.json(updatedTodo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
```

### Generated OpenAPI Output

```yaml
openapi: 3.0.0
info:
  title: Express API
  version: 1.0.0
  description: API documentation generated from Express.js application
paths:
  /:
    get:
      summary: GET /
      operationId: get
      tags:
        - Todos
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    _id:
                      type: string
                    title:
                      type: string
                    completed:
                      type: boolean
        500:
          description: Internal Server Error
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
    post:
      summary: POST /
      operationId: post
      tags:
        - Todos
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
              required:
                - title
      responses:
        201:
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  _id:
                    type: string
                  title:
                    type: string
                  completed:
                    type: boolean
        400:
          description: Bad Request
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
  /{id}:
    patch:
      summary: PATCH /{id}
      operationId: patchid
      tags:
        - Todos
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                completed:
                  type: boolean
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  _id:
                    type: string
                  title:
                    type: string
                  completed:
                    type: boolean
        400:
          description: Bad Request
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Resource not found
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
```

## Supported Express.js Patterns

- ✅ `app.get()`, `app.post()`, `app.put()`, `app.patch()`, `app.delete()`
- ✅ `router.get()`, `router.post()`, `router.put()`, `router.patch()`, `router.delete()`
- ✅ `import { Router } from 'express'` (ES6 modules)
- ✅ `const express = require('express')` (CommonJS)
- ✅ Async/await and Promise patterns
- ✅ MongoDB/Mongoose patterns
- ✅ Try/catch error handling

## Common Use Cases

### 1. **API Documentation Generation**
```bash
express-to-openapi src/routes/api.js yaml
```

### 2. **Multiple Route Files**
```bash
# Generate specs for different route files
express-to-openapi src/routes/users.js json
express-to-openapi src/routes/products.js yaml
```

### 3. **Integration with Documentation Tools**
```bash
# Generate YAML for Swagger UI
express-to-openapi src/app.js yaml

# Generate JSON for Postman import
express-to-openapi src/app.js json
```

## Troubleshooting

### Command Not Found
```bash
# If you get "command not found" error
npm install -g express-to-openapi

# Verify installation
express-to-openapi --help
```

### Permission Issues
```bash
# On macOS/Linux, use sudo if needed
sudo npm install -g express-to-openapi
```

### No Routes Detected
- Ensure your file exports routes using `app.get()` or `router.get()` patterns
- Check that your JavaScript syntax is valid
- Verify the file path is correct

## Command Line Options

```bash
# Basic usage
express-to-openapi <file> [format]

# Examples
express-to-openapi src/app.js          # JSON output (default)
express-to-openapi src/app.js json     # JSON output
express-to-openapi src/app.js yaml     # YAML output

# Using npx
npx express-to-openapi src/app.js json
```

## Development

```bash
# Clone and setup
git clone https://github.com/Sarmad426/express-to-openapi.git
cd express-to-openapi
npm install

# Test locally
node src/express-to-openapi.js src/app.js

# Run tests
npm test
```

## Package Information

- **Type**: Global CLI Tool
- **Node Version**: `>=14.0.0`
- **License**: MIT
- **Binary**: `express-to-openapi`

## Contributing

1. **Report Issues**: [GitHub Issues](https://github.com/Sarmad426/express-to-openapi/issues)
2. **Submit PRs**: Fork → Branch → PR
3. **Feature Requests**: Open an issue with your idea

## Links

- **GitHub**: [https://github.com/Sarmad426/express-to-openapi](https://github.com/Sarmad426/express-to-openapi)
- **npm**: [https://www.npmjs.com/package/express-to-openapi](https://www.npmjs.com/package/express-to-openapi)
- **Issues**: [https://github.com/Sarmad426/express-to-openapi/issues](https://github.com/Sarmad426/express-to-openapi/issues)

---

**Made with ❤️ by [Sarmad](https://github.com/Sarmad426)**