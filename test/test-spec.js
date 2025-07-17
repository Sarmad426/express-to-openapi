import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test the generated OpenAPI spec against expected behavior
function testOpenAPISpec() {
  console.log("🧪 Testing OpenAPI specification accuracy...\n");

  const specPath = path.join(__dirname, "../openapi.json");
  if (!fs.existsSync(specPath)) {
    console.error(
      "❌ OpenAPI spec file not found. Please run the generator first."
    );
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const paths = spec.paths;

  let testsPassed = 0;
  let testsFailed = 0;

  function test(description, assertion) {
    try {
      if (assertion()) {
        console.log(`✅ ${description}`);
        testsPassed++;
      } else {
        console.log(`❌ ${description}`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`❌ ${description} - Error: ${error.message}`);
      testsFailed++;
    }
  }

  // Test 1: POST /api/users should return 201, not 200
  test("POST /api/users returns 201 (Created)", () => {
    const postUsers = paths["/api/users"]?.post;
    return postUsers?.responses["201"] && !postUsers?.responses["200"];
  });

  // Test 2: GET /api/users should not return 400 or 404
  test("GET /api/users does not return 400 or 404", () => {
    const getUsers = paths["/api/users"]?.get;
    return !getUsers?.responses["400"] && !getUsers?.responses["404"];
  });

  // Test 3: GET /health should not return 400 or 404
  test("GET /health does not return 400 or 404", () => {
    const getHealth = paths["/health"]?.get;
    return !getHealth?.responses["400"] && !getHealth?.responses["404"];
  });

  // Test 4: GET /api/users/search should have query parameter 'q'
  test("GET /api/users/search has query parameter 'q'", () => {
    const searchUsers = paths["/api/users/search"]?.get;
    const hasQParam = searchUsers?.parameters?.some(
      (p) => p.name === "q" && p.in === "query"
    );
    return hasQParam;
  });

  // Test 5: Path parameter 'id' should be integer type
  test("Path parameter 'id' is integer type", () => {
    const getUserById = paths["/api/users/{id}"]?.get;
    const idParam = getUserById?.parameters?.find(
      (p) => p.name === "id" && p.in === "path"
    );
    return idParam?.schema?.type === "integer";
  });

  // Test 6: Error responses should have correct schema (success, message)
  test("Error responses have correct schema structure", () => {
    const getUserById = paths["/api/users/{id}"]?.get;
    const errorResponse = getUserById?.responses["404"];
    const schema = errorResponse?.content?.["application/json"]?.schema;
    return schema?.properties?.success && schema?.properties?.message;
  });

  // Test 7: POST /api/users should have request body with name, email, age
  test("POST /api/users has correct request body schema", () => {
    const postUsers = paths["/api/users"]?.post;
    const schema =
      postUsers?.requestBody?.content?.["application/json"]?.schema;
    return (
      schema?.properties?.name &&
      schema?.properties?.email &&
      schema?.properties?.age
    );
  });

  // Test 8: GET /api/users/search should return 200 response
  test("GET /api/users/search returns 200 response", () => {
    const searchUsers = paths["/api/users/search"]?.get;
    return searchUsers?.responses["200"];
  });

  // Test 9: No wildcard routes should be included
  test("No wildcard routes (*) are included", () => {
    return !paths["*"];
  });

  // Test 10: All routes should have proper operation IDs
  test("All routes have operation IDs", () => {
    for (const pathKey in paths) {
      const pathObj = paths[pathKey];
      for (const method in pathObj) {
        if (!pathObj[method].operationId) {
          return false;
        }
      }
    }
    return true;
  });

  // Test 11: Success responses should have proper schema structure
  test("Success responses have proper schema structure", () => {
    const getUsers = paths["/api/users"]?.get;
    const successResponse = getUsers?.responses["200"];
    const schema = successResponse?.content?.["application/json"]?.schema;
    return schema?.properties?.success && schema?.properties?.data;
  });

  // Test 12: Query parameter 'q' should be required in search endpoint
  test("Query parameter 'q' is required in search endpoint", () => {
    const searchUsers = paths["/api/users/search"]?.get;
    const qParam = searchUsers?.parameters?.find((p) => p.name === "q");
    return qParam?.required === true;
  });

  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(
    `🎯 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`
  );

  if (testsFailed === 0) {
    console.log("\n🎉 All tests passed! OpenAPI specification is accurate.");
  } else {
    console.log("\n⚠️  Some tests failed. Please review the specification.");
  }
}

testOpenAPISpec();
