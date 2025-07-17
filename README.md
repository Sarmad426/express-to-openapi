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
- 🚫 **Smart Filtering**: Excludes middleware, error handlers, and non-API routes
- 🔧 **Router Pattern Support**: Works with both `app.get()` and `router.get()` patterns
- 📦 **ES6 Module Support**: Handles modern JavaScript imports and exports

## Installation

### Global Installation (Recommended for CLI)

```bash
npm install -g express-to-openapi
```

### One-time Usage (No Installation)

```bash
npx express-to-openapi <path-to-app.js> [json|yaml]
```

### Local Installation (Not Recommended for CLI)

```bash
npm install express-to-openapi
# Then use: npx express-to-openapi <path-to-app.js> [json|yaml]
```

## Usage

### Basic Usage

```bash
# Generate JSON specification (default)
express-to-openapi src/app.js

# Generate YAML specification
express-to-openapi src/app.js yaml

# Specify output format explicitly
express-to-openapi src/app.js json
```

### Using with npx (No Installation Required)

```bash
# Generate JSON specification
npx express-to-openapi src/app.js

# Generate YAML specification
npx express-to-openapi src/app.js yaml
```

### Example Output

```bash
🔍 Analyzing Express.js application...
✅ OpenAPI spec generated at: /path/to/your/project/openapi.json
📊 Found 5 route(s)

📋 Detected routes:
  GET / (0 params)
  POST / (1 params)
  PATCH /{id} (1 params)
  DELETE /{id} (1 params)
  GET /search (1 params) + query
```

## What Makes This Tool Accurate

### 1. **Correct Status Codes**
- ✅ Analyzes `res.status()` calls to determine actual response codes
- ✅ Distinguishes between `200` (success) and `201` (created) responses
- ✅ Only includes status codes that are actually used in the route handler
- ✅ Detects error handling patterns in try/catch blocks

### 2. **Enhanced Parameter Detection**
- **Path Parameters**: Converts `:id` to `{id}` format with correct types
- **Query Parameters**: Detects `req.query.param` and destructuring patterns
- **Request Body**: Analyzes `req.body` usage and destructuring
- **Type Inference**: Recognizes common patterns (e.g., `completed` as boolean)

### 3. **Intelligent Schema Generation**
- **Response Analysis**: Examines `res.json()` calls to infer response structures
- **MongoDB/Mongoose Support**: Recognizes common database patterns
- **Array vs Object Detection**: Distinguishes between single objects and arrays
- **Property Type Inference**: Infers types from property names and usage

### 4. **Router Pattern Support**
- **Express App**: Supports `app.get()`, `app.post()`, etc.
- **Express Router**: Supports `router.get()`, `router.post()`, etc.
- **ES6 Modules**: Handles `import { Router } from 'express'`
- **CommonJS**: Supports `const express = require('express')`

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
        - default
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
        - default
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
        - default
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

## Local Development

```bash
# Clone this repository
git clone https://github.com/Sarmad426/express-to-openapi.git
cd express-to-openapi

# Install dependencies
npm install

# Run the tool locally
node src/express-to-openapi.js src/app.js

# Run tests
npm test
```

## Testing

Run the comprehensive test suite:

```bash
npm test
```

The test suite validates:
- ✅ Correct status codes for different endpoints
- ✅ Proper parameter detection and typing
- ✅ Accurate schema generation
- ✅ Exclusion of non-API routes
- ✅ Response structure validation
- ✅ Router pattern support
- ✅ ES6 module compatibility

## Package Information

- **Package Type**: CLI Tool (designed for global installation)
- **Main Entry**: `src/express-to-openapi.js`
- **Binary Command**: `express-to-openapi`
- **Node Version**: `>=14.0.0`
- **License**: MIT

## Supported Express.js Patterns

- ✅ `app.get()`, `app.post()`, `app.put()`, `app.patch()`, `app.delete()`
- ✅ `router.get()`, `router.post()`, `router.put()`, `router.patch()`, `router.delete()`
- ✅ `import { Router } from 'express'`
- ✅ `const express = require('express')`
- ✅ ES6 modules and CommonJS
- ✅ Async/await and Promise patterns
- ✅ MongoDB/Mongoose patterns
- ✅ Try/catch error handling

## Contributing

Contributions are welcome! Please feel free to:

1. **Report Issues**: [GitHub Issues](https://github.com/Sarmad426/express-to-openapi/issues)
2. **Submit Pull Requests**: Fork the repository and submit PRs
3. **Suggest Features**: Open an issue with feature requests
4. **Improve Documentation**: Help improve this README

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- **GitHub Repository**: [https://github.com/Sarmad426/express-to-openapi](https://github.com/Sarmad426/express-to-openapi)
- **npm Package**: [https://www.npmjs.com/package/express-to-openapi](https://www.npmjs.com/package/express-to-openapi)
- **Issues**: [https://github.com/Sarmad426/express-to-openapi/issues](https://github.com/Sarmad426/express-to-openapi/issues)

---

**Made with ❤️ by [Sarmad](https://github.com/Sarmad426)**