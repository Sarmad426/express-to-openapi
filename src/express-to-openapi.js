#!/usr/bin/env node
import fs from "fs";
import path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import prettier from "prettier";
import { fileURLToPath } from "url";
import { dirname } from "path";
import yaml from "js-yaml";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function extractRoutesFromExpressApp(fileContent) {
  const ast = acorn.parse(fileContent, {
    ecmaVersion: "latest",
    sourceType: "module",
  });

  const routes = [];
  let appName = null;

  // Helper function to extract code from AST node
  function getCodeFromNode(node) {
    return fileContent.slice(node.start, node.end);
  }

  // Helper function to analyze route handler for response codes and schemas
  function analyzeRouteHandler(handlerFunction) {
    const analysis = {
      statusCodes: new Set([500]), // Always include 500 for server errors
      queryParams: new Set(),
      requestBodySchema: null,
      responseSchema: null,
      requiresAuth: false,
    };

    const handlerCode = getCodeFromNode(handlerFunction);

    // Extract status codes from res.status() calls
    const statusMatches = handlerCode.match(/res\.status\((\d+)\)/g);
    if (statusMatches) {
      statusMatches.forEach((match) => {
        const statusCode = parseInt(match.match(/\d+/)[0]);
        analysis.statusCodes.add(statusCode);
      });
    }

    // Check for res.json() without explicit status (implies 200)
    const jsonResponseMatches = handlerCode.match(/res\.json\s*\(/g);
    if (jsonResponseMatches) {
      // Count res.json() calls that don't have a preceding res.status() on the same line
      const jsonLines = handlerCode.split("\n");
      let hasImplicit200 = false;

      for (let i = 0; i < jsonLines.length; i++) {
        const line = jsonLines[i];
        if (line.includes("res.json(") && !line.includes("res.status(")) {
          // Check if this is a return statement or the main response
          if (line.includes("return") || !line.includes("res.status(400)")) {
            hasImplicit200 = true;
            break;
          }
        }
      }

      if (hasImplicit200) {
        analysis.statusCodes.add(200);
      }
    }

    // Special case for POST routes - if 201 is used, it usually means creation
    if (handlerCode.includes("res.status(201)")) {
      analysis.statusCodes.add(201);
    }

    // If no explicit status codes found, assume 200 for success
    if (analysis.statusCodes.size === 1 && analysis.statusCodes.has(500)) {
      analysis.statusCodes.add(200);
    }

    // Extract query parameters from req.query usage
    const queryMatches = handlerCode.match(/req\.query\.(\w+)/g);
    if (queryMatches) {
      queryMatches.forEach((match) => {
        const paramName = match.split(".")[2];
        analysis.queryParams.add(paramName);
      });
    }

    // Extract query parameter destructuring patterns
    const queryDestructureMatches = handlerCode.match(
      /const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.query/g
    );
    if (queryDestructureMatches) {
      queryDestructureMatches.forEach((match) => {
        const paramsStr = match.match(/\{\s*([^}]+)\s*\}/)[1];
        const params = paramsStr.split(",").map((p) => p.trim());
        params.forEach((param) => {
          analysis.queryParams.add(param);
        });
      });
    }

    // Analyze request body usage
    const bodyMatches = handlerCode.match(/req\.body\.(\w+)/g);
    if (bodyMatches) {
      const bodyProps = new Set();
      bodyMatches.forEach((match) => {
        const propName = match.split(".")[2];
        bodyProps.add(propName);
      });

      if (bodyProps.size > 0) {
        analysis.requestBodySchema = {
          type: "object",
          properties: Object.fromEntries(
            Array.from(bodyProps).map((prop) => [prop, { type: "string" }])
          ),
        };
      }
    }

    // Extract body parameter destructuring patterns
    const bodyDestructureMatches = handlerCode.match(
      /const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.body/g
    );
    if (bodyDestructureMatches) {
      const bodyProps = new Set();
      bodyDestructureMatches.forEach((match) => {
        const paramsStr = match.match(/\{\s*([^}]+)\s*\}/)[1];
        const params = paramsStr.split(",").map((p) => p.trim());
        params.forEach((param) => {
          bodyProps.add(param);
        });
      });

      if (bodyProps.size > 0) {
        analysis.requestBodySchema = {
          type: "object",
          properties: Object.fromEntries(
            Array.from(bodyProps).map((prop) => [prop, { type: "string" }])
          ),
        };
      }
    }

    // Analyze response structure
    const responseMatches = handlerCode.match(
      /res\.json\s*\(\s*\{[\s\S]*?\}\s*\)/g
    );
    if (responseMatches && responseMatches.length > 0) {
      // Try to infer response schema from the first successful response
      const successResponse = responseMatches.find(
        (resp) =>
          !resp.includes("error") &&
          (resp.includes("success:") || resp.includes("data:"))
      );

      if (successResponse) {
        // Basic schema inference based on common patterns
        const responseSchema = {
          type: "object",
          properties: {},
        };

        if (successResponse.includes("success:")) {
          responseSchema.properties.success = { type: "boolean" };
        }
        if (successResponse.includes("data:")) {
          responseSchema.properties.data = { type: "object" };
        }
        if (successResponse.includes("message:")) {
          responseSchema.properties.message = { type: "string" };
        }
        if (successResponse.includes("count:")) {
          responseSchema.properties.count = { type: "number" };
        }

        analysis.responseSchema = responseSchema;
      }
    }

    return analysis;
  }

  walk.simple(ast, {
    VariableDeclarator(node) {
      if (
        node.init &&
        node.init.type === "CallExpression" &&
        node.init.callee.name === "express"
      ) {
        appName = node.id.name;
      }
    },

    ExpressionStatement(node) {
      const expr = node.expression;
      if (
        expr.type === "CallExpression" &&
        expr.callee.type === "MemberExpression" &&
        appName &&
        expr.callee.object.name === appName
      ) {
        const method = expr.callee.property.name.toLowerCase();
        const pathArg = expr.arguments[0];
        const handlerArg = expr.arguments[1];

        // Skip middleware and non-route methods
        if (
          ![
            "get",
            "post",
            "put",
            "patch",
            "delete",
            "head",
            "options",
          ].includes(method)
        ) {
          return;
        }

        if (
          pathArg &&
          (pathArg.type === "Literal" || pathArg.type === "TemplateLiteral")
        ) {
          const routePath =
            pathArg.type === "Literal"
              ? pathArg.value
              : pathArg.quasis[0].value.raw;

          // Skip wildcard routes and middleware
          if (routePath === "*" || !routePath.startsWith("/")) {
            return;
          }

          const parameters = [];
          const queryParams = new Set();
          let analysis = {
            statusCodes: new Set([200, 500]),
            queryParams: new Set(),
            requestBodySchema: null,
            responseSchema: null,
          };

          // Analyze route handler if available
          if (
            handlerArg &&
            (handlerArg.type === "FunctionExpression" ||
              handlerArg.type === "ArrowFunctionExpression")
          ) {
            analysis = analyzeRouteHandler(handlerArg);
          }

          // Process path parameters
          const pathWithOpenAPIParams = routePath.replace(
            /:([a-zA-Z0-9_]+)/g,
            (_, p1) => {
              // Determine parameter type based on common patterns
              let paramType = "string";
              if (p1 === "id" || p1.endsWith("Id") || p1.endsWith("_id")) {
                paramType = "integer";
              }

              parameters.push({
                name: p1,
                in: "path",
                required: true,
                schema: { type: paramType },
              });
              return `{${p1}}`;
            }
          );

          // Add query parameters
          analysis.queryParams.forEach((param) => {
            parameters.push({
              name: param,
              in: "query",
              required: param === "q" || param === "query", // Common required query params
              schema: { type: "string" },
            });
          });

          routes.push({
            method,
            path: pathWithOpenAPIParams,
            parameters,
            statusCodes: analysis.statusCodes,
            hasBody: ["post", "put", "patch"].includes(method),
            requestBodySchema: analysis.requestBodySchema,
            responseSchema: analysis.responseSchema,
          });
        }
      }
    },
  });

  return routes;
}

function generateOpenAPISpec(routes) {
  const paths = {};

  for (const route of routes) {
    const {
      path,
      method,
      parameters,
      statusCodes,
      hasBody,
      requestBodySchema,
      responseSchema,
    } = route;
    if (!paths[path]) paths[path] = {};

    // Build responses based on actual status codes found
    const responses = {};

    statusCodes.forEach((code) => {
      let description = "Success";
      let schema = responseSchema || {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
          message: { type: "string" },
        },
      };

      switch (code) {
        case 200:
          description = "Success";
          break;
        case 201:
          description = "Created";
          break;
        case 400:
          description = "Bad Request";
          schema = {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          };
          break;
        case 401:
          description = "Unauthorized";
          schema = {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          };
          break;
        case 403:
          description = "Forbidden";
          schema = {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          };
          break;
        case 404:
          description = "Not Found";
          schema = {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          };
          break;
        case 500:
          description = "Internal Server Error";
          schema = {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          };
          break;
        default:
          description = `HTTP ${code}`;
      }

      responses[code] = {
        description,
        content: {
          "application/json": {
            schema,
          },
        },
      };
    });

    // Build request body if needed
    const requestBody =
      hasBody && requestBodySchema
        ? {
            required: true,
            content: {
              "application/json": {
                schema: requestBodySchema,
              },
            },
          }
        : hasBody
          ? {
              required: true,
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            }
          : undefined;

    // Generate operation summary and description
    const operationPath = path.replace(/\{[^}]+\}/g, (match) => {
      const paramName = match.slice(1, -1);
      return `{${paramName}}`;
    });

    const summary = `${method.toUpperCase()} ${operationPath}`;
    const operationId = `${method}${path.replace(/[^a-zA-Z0-9]/g, "")}`;

    // Determine tags based on path structure
    const pathSegments = path.split("/").filter(Boolean);
    const tag = pathSegments.length > 0 ? pathSegments[0] : "default";

    paths[path][method] = {
      summary,
      operationId,
      tags: [tag],
      parameters: parameters.length > 0 ? parameters : undefined,
      ...(requestBody && { requestBody }),
      responses,
    };
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "Express API",
      version: "1.0.0",
      description: "API documentation generated from Express.js application",
    },
    paths,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const outputFormat = args[1] || "json"; // json or yaml

  if (!filePath) {
    console.error("❌ Please provide a path to your Express.js app file");
    console.error(
      "Usage: node express-to-openapi.js <path-to-app.js> [json|yaml]"
    );
    process.exit(1);
  }

  if (!["json", "yaml"].includes(outputFormat)) {
    console.error("❌ Output format must be 'json' or 'yaml'");
    process.exit(1);
  }

  // Resolve path relative to current working directory, not script location
  const absPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absPath)) {
    console.error(`❌ File not found: ${absPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath, "utf8");

  console.log("🔍 Analyzing Express.js application...");
  const routes = extractRoutesFromExpressApp(content);
  const openAPISpec = generateOpenAPISpec(routes);

  const outputExtension = outputFormat === "yaml" ? "yaml" : "json";
  const outputPath = path.join(process.cwd(), `openapi.${outputExtension}`);

  let formattedContent;
  if (outputFormat === "yaml") {
    formattedContent = yaml.dump(openAPISpec, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
  } else {
    formattedContent = await prettier.format(JSON.stringify(openAPISpec), {
      parser: "json",
    });
  }

  fs.writeFileSync(outputPath, formattedContent);
  console.log(`✅ OpenAPI spec generated at: ${outputPath}`);
  console.log(`📊 Found ${routes.length} route(s)`);

  // Summary of routes
  if (routes.length > 0) {
    console.log("\n📋 Detected routes:");
    routes.forEach((route) => {
      const params =
        route.parameters.length > 0
          ? ` (${route.parameters.length} params)`
          : "";
      const query = route.parameters.some((p) => p.in === "query")
        ? " + query"
        : "";
      console.log(
        `  ${route.method.toUpperCase()} ${route.path}${params}${query}`
      );
    });
  }
}

main();
