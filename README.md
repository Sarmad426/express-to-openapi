# Express to OpenAPI

A powerful CLI tool that automatically generates accurate OpenAPI 3.0 specifications from Express.js applications.

## Features

- 🔍 **Intelligent Code Analysis**: Parses Express.js route handlers to extract accurate information
- 📊 **Accurate Status Codes**: Detects actual HTTP status codes used in responses
- 🎯 **Parameter Detection**: Automatically identifies path parameters, query parameters, and request body schemas
- 🏷️ **Type Inference**: Intelligently infers parameter types (e.g., `id` parameters as integers)
- 📝 **Multiple Output Formats**: Supports both JSON and YAML output
- ✨ **Schema Generation**: Generates response and request schemas based on actual usage
- 🚫 **Smart Filtering**: Excludes middleware and non-API routes from the specification

## Installation

```bash
npm install -g express-to-openapi
```

Or run directly with npx:

```bash
npx express-to-openapi <path-to-app.js>
```

## Usage

### Basic Usage

```bash
# Generate JSON specification
express-to-openapi src/app.js

# Generate YAML specification
express-to-openapi src/app.js yaml

# Specify output format explicitly
express-to-openapi src/app.js json
```

### Local Development

```bash
# Clone this repository
git clone <repository-url>
cd express-to-openapi

# Install dependencies
npm install

# Run the tool
node src/express-to-openapi.js src/app.js

# Run tests
npm test
```

## What Makes This Tool Accurate

Unlike other tools that make assumptions about Express.js routes, this tool performs deep code analysis to extract accurate information:

### 1. **Correct Status Codes**
- Analyzes `res.status()` calls to determine actual response codes
- Distinguishes between `200` (success) and `201` (created) responses
- Only includes status codes that are actually used in the route handler

### 2. **Parameter Detection**
- **Path Parameters**: Automatically converts `:id` to `{id}` format
- **Query Parameters**: Detects `req.query.param` usage
- **Type Inference**: Recognizes `id` parameters as integers
- **Required Parameters**: Identifies required vs optional parameters

### 3. **Request/Response Schema Generation**
- Analyzes `req.body` destructuring to generate request schemas
- Examines `res.json()` calls to infer response structures
- Creates accurate schema properties based on actual usage

### 4. **Smart Route Filtering**
- Excludes middleware functions (`app.use()`)
- Skips error handlers and wildcard routes
- Only includes actual API endpoints

## Example

Given this Express.js code:

```javascript
app.get('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.find(u => u.id === id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  res.json({
    success: true,
    data: user
  });
});
```

The tool generates:

```yaml
/api/users/{id}:
  get:
    summary: GET /api/users/{id}
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: integer  # Correctly inferred as integer
    responses:
      200:
        description: Success
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                data:
                  type: object
      404:  # Only includes status codes actually used
        description: Not Found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                message:
                  type: string
```

## Testing

Run the test suite to validate the accuracy:

```bash
npm test
```

The test suite verifies:
- Correct status codes for different endpoints
- Proper parameter detection and typing
- Accurate schema generation
- Exclusion of non-API routes
- Response structure validation

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.