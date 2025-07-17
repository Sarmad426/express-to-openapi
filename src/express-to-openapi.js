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

      // Extract path parameters from route pattern
      const pathParams = [];

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

      // Analyze request body usage
      const bodyMatches = handlerCode.match(/req\.body\.(\w+)/g);
      if (bodyMatches) {
        const bodyProps = new Set();
        bodyMatches.forEach((match) => {
          const prop = match.replace("req.body.", "");
          bodyProps.add(prop);
        });

        if (bodyProps.size > 0) {
          const properties = {};
          bodyProps.forEach((prop) => {
            properties[prop] = { type: "string" };
          });

          analysis.requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties,
                  required: Array.from(bodyProps),
                },
              },
            },
          };
        }
      }

      // Extract body parameter destructuring patterns
      const bodyDestructureMatches = handlerCode.match(
        /const\s*\{\s*([^}]+)\s*\}\s*=\s*req\.body/g
      );
      if (bodyDestructureMatches) {
        bodyDestructureMatches.forEach((match) => {
          const propsMatch = match.match(/\{\s*([^}]+)\s*\}/);
          if (propsMatch) {
            const props = propsMatch[1].split(",").map((p) => p.trim());
            const bodyProps = new Set(props);

            if (bodyProps.size > 0) {
              const properties = {};
              bodyProps.forEach((prop) => {
                properties[prop] = { type: "string" };
              });

              analysis.requestBody = {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties,
                      required: Array.from(bodyProps),
                    },
                  },
                },
              };
            }
          }
        });
      }

      // Analyze response patterns
      const responsePatterns = [
        { pattern: /res\.status\(\s*(\d+)\s*\)\.json\s*\(/g, hasStatus: true },
        { pattern: /res\.json\s*\(/g, hasStatus: false },
        { pattern: /res\.send\s*\(/g, hasStatus: false },
        { pattern: /res\.status\(\s*(\d+)\s*\)\.send\s*\(/g, hasStatus: true },
      ];

      responsePatterns.forEach(({ pattern, hasStatus }) => {
        let match;
        while ((match = pattern.exec(handlerCode)) !== null) {
          const statusCode = hasStatus ? match[1] : "200";

          if (!analysis.responses[statusCode]) {
            analysis.responses[statusCode] = {
              description: getResponseDescription(statusCode),
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            };
          }
        }
      });

      // Add common error responses if not already present
      if (handlerCode.includes("try") && handlerCode.includes("catch")) {
        if (!analysis.responses["500"]) {
          analysis.responses["500"] = {
            description: "Internal Server Error",
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
      }

      // Add 404 for routes with params that check for existence
      if (
        handlerCode.includes("findById") ||
        handlerCode.includes("not found")
      ) {
        if (!analysis.responses["404"]) {
          analysis.responses["404"] = {
            description: "Resource not found",
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
      }

      // Add 400 for validation errors
      if (
        handlerCode.includes("status(400)") ||
        handlerCode.includes("validation")
      ) {
        if (!analysis.responses["400"]) {
          analysis.responses["400"] = {
            description: "Bad Request",
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
      }

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
          params.push({
            name: paramName,
            in: "path",
            required: true,
            schema: { type: "string" },
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
  const outputFormat = args[1] || "json";

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
