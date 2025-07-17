#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { parse } from "acorn";
import * as walk from "acorn-walk";
import yaml from "js-yaml";
import prettier from "prettier";

function extractRoutesFromExpressApp(fileContent) {
  const routes = [];

  try {
    const ast = parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: "module",
      allowImportExportEverywhere: true,
    });

    let appName = null;
    let routerName = null;

    // Function to analyze route handler for parameters and responses
    function analyzeRouteHandler(handlerFunction) {
      const analysis = {
        parameters: [],
        requestBody: null,
        responses: {},
      };

      if (!handlerFunction) return analysis;

      let handlerCode = "";
      if (
        handlerFunction.type === "FunctionExpression" ||
        handlerFunction.type === "ArrowFunctionExpression"
      ) {
        handlerCode = fileContent.substring(
          handlerFunction.start,
          handlerFunction.end
        );
      }

      // Extract query parameters
      const queryMatches = handlerCode.match(/req\.query\.(\w+)/g);
      if (queryMatches) {
        queryMatches.forEach((match) => {
          const param = match.replace("req.query.", "");
          if (!analysis.parameters.find((p) => p.name === param)) {
            analysis.parameters.push({
              name: param,
              in: "query",
              required: false,
              schema: { type: "string" },
            });
          }
        });
      }

      // Extract query parameter destructuring patterns
      const queryDestructureMatches = handlerCode.match(
        /const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.query/g
      );
      if (queryDestructureMatches) {
        queryDestructureMatches.forEach((match) => {
          const propsMatch = match.match(/\{\s*([^}]+)\s*\}/);
          if (propsMatch) {
            const props = propsMatch[1].split(",").map((p) => p.trim());
            props.forEach((prop) => {
              if (!analysis.parameters.find((p) => p.name === prop)) {
                analysis.parameters.push({
                  name: prop,
                  in: "query",
                  required: false,
                  schema: { type: "string" },
                });
              }
            });
          }
        });
      }

      // Enhanced request body analysis with accurate type inference
      const bodyMatches = handlerCode.match(/req\.body\.(\w+)/g);
      if (bodyMatches) {
        const bodyProps = new Map();
        bodyMatches.forEach((match) => {
          const prop = match.replace("req.body.", "");

          // Enhanced type inference with more accurate patterns
          let type = "string";

          // Look for context clues in the surrounding code
          const propContext = handlerCode.toLowerCase();

          if (
            prop === "completed" ||
            prop === "active" ||
            prop === "enabled" ||
            prop === "published"
          ) {
            type = "boolean";
          } else if (
            prop === "age" ||
            prop === "count" ||
            prop === "price" ||
            prop === "quantity"
          ) {
            type = "integer";
          } else if (
            prop === "rating" ||
            prop === "score" ||
            prop === "percentage"
          ) {
            type = "number";
          } else if (
            propContext.includes(`${prop.toLowerCase()}: true`) ||
            propContext.includes(`${prop.toLowerCase()}: false`)
          ) {
            type = "boolean";
          } else if (
            propContext.includes(`parseint(req.body.${prop.toLowerCase()})`) ||
            propContext.includes(`number(req.body.${prop.toLowerCase()})`)
          ) {
            type = "integer";
          }

          bodyProps.set(prop, type);
        });

        if (bodyProps.size > 0) {
          const properties = {};
          const required = [];

          bodyProps.forEach((type, prop) => {
            properties[prop] = { type };

            // Mark required fields based on validation patterns
            if (
              handlerCode.includes(`!req.body.${prop}`) ||
              handlerCode.includes(`req.body.${prop} === undefined`) ||
              handlerCode.includes(`req.body.${prop} === null`) ||
              prop === "title" ||
              prop === "name" ||
              prop === "email"
            ) {
              required.push(prop);
            }
          });

          analysis.requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties,
                  ...(required.length > 0 && { required }),
                },
              },
            },
          };
        }
      }

      // Extract body parameter destructuring patterns with accurate type inference
      const bodyDestructureMatches = handlerCode.match(
        /const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.body/g
      );
      if (bodyDestructureMatches) {
        bodyDestructureMatches.forEach((match) => {
          const propsMatch = match.match(/\{\s*([^}]+)\s*\}/);
          if (propsMatch) {
            const props = propsMatch[1].split(",").map((p) => p.trim());
            const bodyProps = new Map();
            const required = [];

            props.forEach((prop) => {
              // Enhanced type inference
              let type = "string";

              if (
                prop === "completed" ||
                prop === "active" ||
                prop === "enabled" ||
                prop === "published"
              ) {
                type = "boolean";
              } else if (
                prop === "age" ||
                prop === "count" ||
                prop === "price" ||
                prop === "quantity"
              ) {
                type = "integer";
              } else if (
                prop === "rating" ||
                prop === "score" ||
                prop === "percentage"
              ) {
                type = "number";
              }

              bodyProps.set(prop, type);

              // Mark required fields
              if (
                handlerCode.includes(`!${prop}`) ||
                prop === "title" ||
                prop === "name" ||
                prop === "email"
              ) {
                required.push(prop);
              }
            });

            if (bodyProps.size > 0) {
              const properties = {};
              bodyProps.forEach((type, prop) => {
                properties[prop] = { type };
              });

              analysis.requestBody = {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties,
                      ...(required.length > 0 && { required }),
                    },
                  },
                },
              };
            }
          }
        });
      }

      // Enhanced response analysis with precise status code and schema detection
      const responsePatterns = [
        {
          pattern: /res\.status\(\s*(\d+)\s*\)\.json\s*\(\s*([^)]+)\s*\)/g,
          hasStatus: true,
          hasData: true,
        },
        {
          pattern: /res\.json\s*\(\s*([^)]+)\s*\)/g,
          hasStatus: false,
          hasData: true,
        },
        {
          pattern: /res\.status\(\s*(\d+)\s*\)\.json\s*\(/g,
          hasStatus: true,
          hasData: false,
        },
        { pattern: /res\.json\s*\(/g, hasStatus: false, hasData: false },
        {
          pattern: /res\.status\(\s*(\d+)\s*\)\.send\s*\(/g,
          hasStatus: true,
          hasData: false,
        },
        { pattern: /res\.send\s*\(/g, hasStatus: false, hasData: false },
      ];

      responsePatterns.forEach(({ pattern, hasStatus, hasData }) => {
        let match;
        while ((match = pattern.exec(handlerCode)) !== null) {
          const statusCode = hasStatus ? match[1] : "200";
          const dataExpression = hasData ? match[hasStatus ? 2 : 1] : null;

          if (!analysis.responses[statusCode]) {
            const schema = analyzeResponseSchema(
              dataExpression,
              handlerCode,
              statusCode,
              match[0] // Pass the full match for better context
            );

            analysis.responses[statusCode] = {
              description: getResponseDescription(statusCode),
              content: {
                "application/json": {
                  schema,
                },
              },
            };
          }
        }
      });

      // Enhanced error handling analysis - only add errors that are actually present
      if (handlerCode.includes("try") && handlerCode.includes("catch")) {
        // Look for specific error status codes in catch blocks
        const catchBlocks = handlerCode.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g);
        if (catchBlocks) {
          catchBlocks.forEach((catchBlock) => {
            const statusMatches = catchBlock.match(
              /res\.status\(\s*(\d+)\s*\)/g
            );
            if (statusMatches) {
              statusMatches.forEach((statusMatch) => {
                const statusCode = statusMatch.match(/\d+/)[0];
                if (!analysis.responses[statusCode]) {
                  analysis.responses[statusCode] = {
                    description: getResponseDescription(statusCode),
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            message: { type: "string" },
                          },
                        },
                      },
                    },
                  };
                }
              });
            }
          });
        }
      }

      // Enhanced 404 detection - only add if explicitly handled
      const notFoundPatterns = [
        /if\s*\(\s*!.*\)\s*\{[^}]*res\.status\(\s*404\s*\)/,
        /if\s*\(\s*!.*\)\s*\{[^}]*return\s+res\.status\(\s*404\s*\)/,
        /if\s*\(\s*!.*\)\s*return\s+res\.status\(\s*404\s*\)/,
      ];

      notFoundPatterns.forEach((pattern) => {
        if (pattern.test(handlerCode)) {
          if (!analysis.responses["404"]) {
            // Look for the actual 404 response content
            const notFoundMatch = handlerCode.match(
              /res\.status\(\s*404\s*\)\.json\s*\(\s*([^)]+)\s*\)/
            );

            let schema = {
              type: "object",
              properties: {
                message: { type: "string" },
              },
            };

            if (notFoundMatch) {
              const responseContent = notFoundMatch[1];
              schema = analyzeResponseSchema(
                responseContent,
                handlerCode,
                "404",
                notFoundMatch[0]
              );
            }

            analysis.responses["404"] = {
              description: "Resource not found",
              content: {
                "application/json": {
                  schema,
                },
              },
            };
          }
        }
      });

      // Ensure at least one success response exists
      if (Object.keys(analysis.responses).length === 0) {
        analysis.responses["200"] = {
          description: "Success",
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        };
      }

      return analysis;
    }

    // Enhanced response schema analysis with precise type detection
    function analyzeResponseSchema(
      dataExpression,
      handlerCode,
      statusCode,
      fullMatch
    ) {
      if (!dataExpression) {
        return { type: "object" };
      }

      const expr = dataExpression.trim();

      // Handle message-only responses
      if (
        expr.includes("message:") ||
        expr.includes("'message'") ||
        expr.includes('"message"')
      ) {
        return {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        };
      }

      // Handle specific literal messages
      if (
        expr.includes("'Todo deleted'") ||
        expr.includes('"Todo deleted"') ||
        expr.includes("'deleted'") ||
        expr.includes('"deleted"')
      ) {
        return {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        };
      }

      // Handle array responses
      if (
        expr.includes("todos") ||
        expr.includes("users") ||
        expr.includes("items") ||
        handlerCode.includes(".find()") ||
        handlerCode.includes(".findAll()")
      ) {
        return {
          type: "array",
          items: {
            type: "object",
            properties: inferObjectProperties(expr, handlerCode),
          },
        };
      }

      // Handle single object responses
      if (
        expr.includes("newTodo") ||
        expr.includes("updatedTodo") ||
        expr.includes("todo") ||
        expr.includes("Todo")
      ) {
        return {
          type: "object",
          properties: inferObjectProperties(expr, handlerCode),
        };
      }

      // Handle specific status codes
      if (statusCode === "201") {
        return {
          type: "object",
          properties: inferObjectProperties(expr, handlerCode),
        };
      }

      if (statusCode === "200") {
        // Check if it's an array response
        if (
          handlerCode.includes(".find()") &&
          !handlerCode.includes(".findById")
        ) {
          return {
            type: "array",
            items: {
              type: "object",
              properties: inferObjectProperties(expr, handlerCode),
            },
          };
        }

        // Check if it's a message response
        if (fullMatch && fullMatch.includes("message")) {
          return {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          };
        }

        return {
          type: "object",
          properties: inferObjectProperties(expr, handlerCode),
        };
      }

      // Default error response
      if (["400", "404", "500"].includes(statusCode)) {
        return {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        };
      }

      return { type: "object" };
    }

    // Enhanced object properties inference
    function inferObjectProperties(expression, handlerCode) {
      const properties = {};

      // Common MongoDB/Mongoose patterns for Todo
      if (handlerCode.includes("Todo") || handlerCode.includes("todo")) {
        properties._id = { type: "string" };
        properties.title = { type: "string" };
        properties.completed = { type: "boolean" };

        // Look for additional properties in the code
        const titleMatch = handlerCode.match(/title:\s*req\.body\.title/);
        if (titleMatch) {
          properties.title = { type: "string" };
        }

        const completedMatch = handlerCode.match(
          /completed:\s*req\.body\.completed/
        );
        if (completedMatch) {
          properties.completed = { type: "boolean" };
        }
      }

      // Common User patterns
      if (handlerCode.includes("User") || handlerCode.includes("user")) {
        properties._id = { type: "string" };
        properties.name = { type: "string" };
        properties.email = { type: "string" };

        if (handlerCode.includes("age")) {
          properties.age = { type: "integer" };
        }
      }

      // Look for new object creation patterns
      const newObjectMatches = handlerCode.match(
        /new\s+\w+\s*\(\s*\{([^}]+)\}\s*\)/g
      );
      if (newObjectMatches) {
        newObjectMatches.forEach((match) => {
          const propsMatch = match.match(/\{([^}]+)\}/);
          if (propsMatch) {
            const props = propsMatch[1].split(",");
            props.forEach((prop) => {
              const propMatch = prop.match(/(\w+):\s*req\.body\.(\w+)/);
              if (propMatch) {
                const propName = propMatch[1].trim();
                const bodyProp = propMatch[2].trim();

                // Infer type based on property name
                let type = "string";
                if (
                  propName === "completed" ||
                  propName === "active" ||
                  propName === "enabled"
                ) {
                  type = "boolean";
                } else if (
                  propName === "age" ||
                  propName === "count" ||
                  propName === "price"
                ) {
                  type = "integer";
                }

                properties[propName] = { type };
              }
            });
          }
        });
      }

      // Look for findByIdAndUpdate patterns
      const updateMatches = handlerCode.match(
        /findByIdAndUpdate\s*\([^,]+,\s*\{([^}]+)\}/g
      );
      if (updateMatches) {
        updateMatches.forEach((match) => {
          const propsMatch = match.match(/\{([^}]+)\}/);
          if (propsMatch) {
            const updateProps = propsMatch[1];
            if (updateProps.includes("completed")) {
              properties.completed = { type: "boolean" };
            }
          }
        });
      }

      return Object.keys(properties).length > 0
        ? properties
        : { _id: { type: "string" } };
    }

    function getResponseDescription(statusCode) {
      const descriptions = {
        200: "Success",
        201: "Created",
        204: "No Content",
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        500: "Internal Server Error",
      };
      return descriptions[statusCode] || "Response";
    }

    // Extract path parameters from route pattern
    function extractPathParams(routePath) {
      const params = [];
      const paramMatches = routePath.match(/:(\w+)/g);
      if (paramMatches) {
        paramMatches.forEach((match) => {
          const paramName = match.substring(1);

          // Infer parameter type based on name
          let type = "string";
          if (paramName === "id" || paramName.endsWith("Id")) {
            type = "string"; // MongoDB ObjectId is typically string
          } else if (
            paramName === "page" ||
            paramName === "limit" ||
            paramName === "count"
          ) {
            type = "integer";
          }

          params.push({
            name: paramName,
            in: "path",
            required: true,
            schema: { type },
          });
        });
      }
      return params;
    }

    // Convert Express route pattern to OpenAPI format
    function convertRouteToOpenAPI(routePath) {
      return routePath.replace(/:(\w+)/g, "{$1}");
    }

    walk.simple(ast, {
      // Handle app = express() pattern
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === "CallExpression" &&
          node.init.callee.name === "express"
        ) {
          appName = node.id.name;
        }
        // Handle router = Router() pattern
        if (
          node.init &&
          node.init.type === "CallExpression" &&
          node.init.callee.name === "Router"
        ) {
          routerName = node.id.name;
        }
      },

      // Handle import statements for Router
      ImportDeclaration(node) {
        if (node.source.value === "express") {
          node.specifiers.forEach((spec) => {
            if (
              spec.type === "ImportSpecifier" &&
              spec.imported.name === "Router"
            ) {
              // Router is imported, now look for variable declarations
            }
          });
        }
      },

      // Handle route definitions
      ExpressionStatement(node) {
        const expr = node.expression;
        if (
          expr.type === "CallExpression" &&
          expr.callee.type === "MemberExpression"
        ) {
          const obj = expr.callee.object;
          const method = expr.callee.property;

          // Check if it's app.method() or router.method()
          const isAppRoute = appName && obj.name === appName;
          const isRouterRoute = routerName && obj.name === routerName;

          if ((isAppRoute || isRouterRoute) && method && method.name) {
            const httpMethod = method.name.toLowerCase();
            const validMethods = [
              "get",
              "post",
              "put",
              "patch",
              "delete",
              "head",
              "options",
            ];

            if (
              validMethods.includes(httpMethod) &&
              expr.arguments.length >= 2
            ) {
              const routePath = expr.arguments[0];
              const handlerFunction = expr.arguments[expr.arguments.length - 1];

              if (
                routePath.type === "Literal" &&
                typeof routePath.value === "string"
              ) {
                const path = routePath.value;

                // Skip middleware-like routes
                if (path === "*" || path.includes("*")) return;

                // Analyze the route handler
                const analysis = analyzeRouteHandler(handlerFunction);

                // Extract path parameters
                const pathParams = extractPathParams(path);

                // Combine path and query parameters
                const allParams = [...pathParams, ...analysis.parameters];

                routes.push({
                  path: convertRouteToOpenAPI(path),
                  method: httpMethod,
                  parameters: allParams,
                  requestBody: analysis.requestBody,
                  responses: analysis.responses,
                });
              }
            }
          }
        }
      },
    });
  } catch (error) {
    console.error("Error parsing file:", error.message);
    console.error("Make sure your JavaScript file has valid syntax");
  }

  return routes;
}

function generateOpenAPISpec(routes) {
  const paths = {};

  for (const route of routes) {
    const { path, method, parameters, requestBody, responses } = route;

    if (!paths[path]) {
      paths[path] = {};
    }

    // Generate operation summary and description
    const operationPath = path.replace(/\{[^}]+\}/g, (match) => {
      return match.toLowerCase();
    });

    const summary = `${method.toUpperCase()} ${operationPath}`;
    const operationId = `${method}${path.replace(/[^a-zA-Z0-9]/g, "")}`;

    // Enhanced tagging - use consistent resource-based tags
    let tag = "default";
    if (path.includes("todo") || path.includes("Todo")) {
      tag = "Todos";
    } else if (path.includes("user") || path.includes("User")) {
      tag = "Users";
    } else {
      // Use first path segment as tag, but make it descriptive
      const pathSegments = path.split("/").filter(Boolean);
      if (pathSegments.length > 0) {
        const firstSegment = pathSegments[0];
        if (firstSegment.startsWith("{") && firstSegment.endsWith("}")) {
          // If first segment is a parameter, use a generic tag
          tag = "Resources";
        } else {
          tag = firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
        }
      }
    }

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
  const outputFormat = args[1] || "json";

  if (!filePath) {
    console.error("❌ Please provide a path to your Express.js app file");
    console.error("Usage: express-to-openapi <path-to-app.js> [json|yaml]");
    console.error("\nInstallation methods:");
    console.error("  Global:  npm install -g express-to-openapi");
    console.error("  One-time: npx express-to-openapi <app.js> [json|yaml]");
    process.exit(1);
  }

  if (!["json", "yaml"].includes(outputFormat)) {
    console.error("❌ Output format must be 'json' or 'yaml'");
    process.exit(1);
  }

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
