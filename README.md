# Research Summarizer AI

A serverless web application where users log in, upload research documents (PDF or text), and get AI-generated summaries powered by Amazon Bedrock. The app stores summaries in DynamoDB, shows a history list, and lets users delete entries (and the underlying S3 file).

This README describes the entire project – frontend and backend – and explains how to recreate all AWS resources without exposing any personal credentials.

======================================================================
1. HIGH-LEVEL ARCHITECTURE
======================================================================

Frontend
- React + Vite single-page app
- Uses AWS Amplify UI Authenticator for login
- Hosted on AWS Amplify Hosting
- Calls backend via API Gateway using Cognito JWT in Authorization header

Backend
- Amazon API Gateway (HTTP API)
- 4 AWS Lambda functions (Node.js):
  - backend/research-upload.mjs
  - backend/research-summarize.mjs
  - backend/research-history.mjs
  - backend/research-delete.mjs
- Amazon S3 bucket to store uploaded documents
- Amazon DynamoDB table to store summaries
- Amazon Bedrock (Claude model) to generate summaries
- Amazon Cognito User Pool for user management and JWTs
- IAM Roles and Policies to grant least-privilege access

Simple data flow:

1) User signs in via Cognito (Amplify Authenticator).
2) User picks a file in the React UI and clicks Upload & Summarize.
3) Frontend calls POST /upload with a JWT → Lambda returns a presigned S3 URL and fileKey.
4) Frontend uploads the file directly to S3 via the presigned URL.
5) Frontend calls POST /summarize with fileKey → Lambda:
   - reads object from S3
   - calls Bedrock to summarize
   - saves { userId, createdAt, fileKey, email, summary } to DynamoDB
   - returns summary
6) Frontend loads past summaries using GET /history.
7) User can delete items via DELETE /item/{fileKey+}, which removes from DynamoDB and S3.

======================================================================
2. REPOSITORY STRUCTURE
======================================================================

Top-level layout (recommended):

project-root/
  backend/
    research-upload(.mjs)
    research-summarize(.mjs)
    research-history(.mjs)
    research-delete(.mjs)
  frontend/
    src/
    public/
    package.json
    vite.config.js
    amplify.yml (for Amplify build)
  README.md

- backend/ contains code for all Lambda functions (one file per function).
- frontend/ contains the React app that talks to API Gateway.

======================================================================
3. PREREQUISITES
======================================================================

- AWS account with access to:
  - Cognito
  - S3
  - DynamoDB
  - Lambda
  - API Gateway (HTTP API)
  - Amazon Bedrock (with access to at least one Claude model)
  - Amplify
- Node.js and npm installed locally
- Git and a GitHub (or other Git provider) repository

======================================================================
4. FRONTEND SETUP (LOCAL)
======================================================================

1) Clone the repository locally.

2) Go into the frontend folder:
   cd frontend

3) Install dependencies:
   npm install

4) Local development:
   npm run dev
   By default Vite runs at http://localhost:5173

You will finish Cognito and API Gateway setup first, then come back to configure the frontend environment variables.

======================================================================
5. AWS SETUP – STEP BY STEP
======================================================================

The order that works best:

1) Create Cognito User Pool (auth).
2) Create S3 upload bucket.
3) Create DynamoDB table.
4) Create IAM policies and roles for Lambda.
5) Enable Bedrock model access.
6) Deploy Lambda functions.
7) Create API Gateway HTTP API, routes, and integrations.
8) Configure CORS and test APIs.
9) Configure and deploy Amplify Hosting for the frontend.

--------------------------------------------------
5.1. Amazon Cognito – User Pool and Hosted UI
--------------------------------------------------

Goal: issue JWTs that your frontend passes to API Gateway as Authorization: Bearer <token>.

Steps:

1) In Cognito, create a new User Pool (use “Users in user pool” option).
2) Configure sign-in options:
   - Use email as a sign-in alias (simple choice).
3) Create an App Client (or “Application” depending on new UI):
   - Enable “Authorization code grant” or “Code” flow.
   - Allowed OAuth scopes: openid, email.
4) Configure domain for the Hosted UI:
   - Choose a Cognito-hosted domain prefix.
5) Set callback and sign-out URLs:
   - For local dev: http://localhost:5173/
   - For Amplify hosting: your Amplify URL (e.g. https://yourappid.amplifyapp.com/)
   - You can add both local and production URLs.
6) Make note of:
   - User Pool ID
   - User Pool Region
   - App Client ID
   - Hosted UI domain

You will use these values later in the frontend configuration and Amplify Authenticator.

--------------------------------------------------
5.2. S3 Bucket for Uploads
--------------------------------------------------

Goal: store original documents safely, using a structure like:
private/{userId}/{timestamp}-{filename}

Steps:

1) Open S3 and create a bucket:
   - Name: choose a unique bucket name (e.g. research-summarizer-uploads-xyz).
   - Region: same as your Lambdas and Bedrock region for simplicity.
2) Block public access:
   - Leave “Block all public access” enabled (recommended).
3) Versioning: optional.
4) Encryption: you may enable SSE-S3 or SSE-KMS.
5) Set CORS configuration to allow browser uploads via presigned URLs. Example structure (expressed in words, not JSON):
   - Allowed origins: your local dev origin (http://localhost:5173) and your Amplify domain.
   - Allowed methods: PUT, GET, HEAD, OPTIONS.
   - Allowed headers: Authorization, Content-Type, x-amz-date, x-amz-security-token, x-amz-user-agent, and any other standard S3 headers.
   - Expose headers: as needed (often none).

Note the bucket name; this will be used as the UPLOAD_BUCKET environment variable in Lambdas.

--------------------------------------------------
5.3. DynamoDB Table for History
--------------------------------------------------

Goal: store summaries per user, sorted by time.

1) Create a new DynamoDB table:
   - Table name: ResearchSummaries (or similar).
   - Partition key:
     - Name: userId
     - Type: String
   - Sort key:
     - Name: createdAt
     - Type: String
2) Leave default settings for capacity (on-demand is easiest).
3) You will store items with attributes:
   - userId (PK)
   - createdAt (SK, ISO timestamp)
   - email (String)
   - fileKey (String)
   - summary (String)

Note the table name; used as HISTORY_TABLE environment variable in Lambdas.

--------------------------------------------------
5.4. IAM – Roles and Permissions for Lambda
--------------------------------------------------

You can either use one shared execution role for all four functions, or separate roles for each. Here is what the role needs:

Basic Lambda permissions:
- logs:CreateLogGroup
- logs:CreateLogStream
- logs:PutLogEvents

DynamoDB permissions (for the history table):
- dynamodb:PutItem
- dynamodb:Query
- dynamodb:DeleteItem
- dynamodb:DescribeTable

S3 permissions (for the upload bucket):
- s3:PutObject
- s3:GetObject
- s3:DeleteObject
- s3:ListBucket (optional, depending on implementation)

Bedrock permissions:
- bedrock:InvokeModel
- bedrock:InvokeModelWithResponseStream (depending on SDK usage)

Scope all these permissions to:
- The specific DynamoDB table ARN.
- The specific S3 bucket ARN and its objects.
- The specific Bedrock model you plan to use (for example, a Claude 3 Sonnet model ID in your region).

Attach this IAM role as the “Execution role” to each Lambda function you create.

--------------------------------------------------
5.5. Amazon Bedrock – Model Access
--------------------------------------------------

1) In the AWS console, open Amazon Bedrock.
2) Under “Model access”, request access for:
   - The Claude model you want to use (for example, a Claude 3 Sonnet model version).
3) Wait until access is granted.
4) Note the model ID string and region (e.g., a model name such as anthropic.claude-3-sonnet-20240229-v1:0 in a given region).

You will use this in the research-summarize Lambda.

--------------------------------------------------
5.6. Lambda Functions – Backend Files
--------------------------------------------------

You have four backend files:

backend/research-upload.mjs
backend/research-summarize.mjs
backend/research-history.mjs
backend/research-delete.mjs

Each is a Node.js (ES module) Lambda handler that expects an API Gateway HTTP API event.

General Lambda configuration for all four:

- Runtime: Node.js 20.x (or current supported LTS).
- Handler:
  - If the file exports "handler" as the function, the handler setting is:
    - research-upload.handler
    - research-summarize.handler
    - research-history.handler
    - research-delete.handler
- Execution role: the IAM role created earlier.
- Memory: 256 MB or more is usually enough.
- Timeout: 30 seconds is safe for Bedrock calls.

Environment variables (common):

- REGION: your AWS region (e.g. us-east-1).
- UPLOAD_BUCKET: name of the S3 bucket you created.
- HISTORY_TABLE: name of the DynamoDB table.

Additional for research-summarize:

- BEDROCK_MODEL_ID: your Claude model ID string.

After you create the functions in the console (or via CLI), upload the corresponding backend/*.mjs file as the function code for each.

--------------------------------------------------
5.7. API Gateway – HTTP API, Routes, Integrations, Auth
--------------------------------------------------

Goal: create a single HTTP API with JWT auth that forwards to the four Lambdas.

1) Create HTTP API:
   - Choose “Build” for HTTP API.
   - Under “Integrations” you’ll add Lambda functions later.

2) Create JWT Authorizer:
   - Type: JWT authorizer.
   - Issuer URL: your Cognito User Pool’s issuer URL (something like https://cognito-idp.<region>.amazonaws.com/<user-pool-id>).
   - Audience: your Cognito App Client ID.
   - Save the authorizer.

3) Add Lambda integrations:
   - Create an integration for each Lambda:
     - research-upload
     - research-summarize
     - research-history
     - research-delete

4) Create routes (methods and paths):
   a) POST /upload
      - Integration: research-upload Lambda.
      - Authorizer: your JWT authorizer (required).
      - Payload format: Lambda proxy (default).

   b) POST /summarize
      - Integration: research-summarize Lambda.
      - Authorizer: JWT authorizer.

   c) GET /history
      - Integration: research-history Lambda.
      - Authorizer: JWT authorizer.
      - The Lambda can optionally read a “limit” query parameter.

   d) DELETE /item/{fileKey+}
      - PLUS sign at the end of {fileKey+} ensures the entire fileKey with slashes is captured.
      - Integration: research-delete Lambda.
      - Authorizer: JWT authorizer.

5) Configure CORS for the API:
   - Allowed origins:
     - http://localhost:5173
     - Your Amplify production URL
   - Allowed methods:
     - GET, POST, DELETE, OPTIONS
   - Allowed headers:
     - Authorization, Content-Type
   - Allow credentials: enabled if you need cookies, but for JWT in header it is usually fine disabled.

6) Deploy the API:
   - Create a stage (for example: dev).
   - Note the base URL:
     https://<api-id>.execute-api.<region>.amazonaws.com/dev

7) Test via console:
   - Use “Test” in API Gateway or send HTTP requests with a sample JWT token (from a test login) to verify each route.

======================================================================
6. FRONTEND INTEGRATION WITH BACKEND
======================================================================

You must connect three things in the React app:

1) Cognito (for authentication)
2) API Gateway base URL
3) Region or any other constants you need

--------------------------------------------------
6.1. Frontend Environment Variables
--------------------------------------------------

In the frontend project, create a .env file for local development (do not commit secrets):

VITE_API_BASE_URL = https://<api-id>.execute-api.<region>.amazonaws.com/dev

Other Cognito-related values are typically stored in a configuration file used by Amplify, such as:

- aws_project_region
- aws_user_pools_id
- aws_user_pools_web_client_id
- oauth domain, redirectSignIn, redirectSignOut, etc.

How you configure this depends on whether you use “Amplify configure” or manual configuration. A common pattern is:

- Have a config file (for example src/awsConfig.js) that initializes Amplify’s Auth with your Cognito values.
- The Authenticator component from @aws-amplify/ui-react uses this configuration under the hood.

--------------------------------------------------
6.2. React App Behavior
--------------------------------------------------

Main responsibilities of the React app:

- Wrap the content in an <Authenticator> component so only logged-in users can see the main UI.
- On file selection:
  - Validate file type and size (the project uses a 4.5 MB limit).
- On “Upload & Summarize”:
  - Get the Cognito ID token via fetchAuthSession from aws-amplify/auth.
  - Call POST /upload with:
    - Headers: Content-Type: application/json, Authorization: Bearer <ID token>
    - Body: JSON with fileName and contentType.
  - Receive uploadUrl and fileKey.
  - Use fetch to PUT the raw file to uploadUrl (S3).
  - Immediately call POST /summarize with the same Authorization header and body { fileKey }.
- On success:
  - Display returned summary in the UI.
  - Refresh history by calling GET /history.
- History panel:
  - Calls GET /history with Authorization header.
  - Renders items with formatted date/time and summary preview.
  - On click: show full summary.
  - On delete: calls DELETE /item/{fileKey+} with Authorization header and removes the item from local state if successful.

======================================================================
7. AMPLIFY HOSTING
======================================================================

Goal: deploy the frontend using AWS Amplify CI/CD while keeping Lambdas and infrastructure managed separately.

Steps:

1) Push your repo to GitHub (or another Git provider).
2) Open AWS Amplify console → “Host a web app” → connect the repository.
3) Choose the main branch.
4) When Amplify detects the repo, configure the build settings:
   - You can use an amplify.yml file in the project root. Example behavior (described, not in YAML syntax):
     - In preBuild: change directory into frontend and run npm install (or npm ci).
     - In build: run npm run build.
     - Artifacts:
       - baseDirectory: frontend/dist
       - files: **/*
5) In Amplify console, set environment variables:
   - VITE_API_BASE_URL: your API Gateway base URL.
   - Any other configuration values needed by the React app (that are safe to expose as build-time env vars).

Amplify will:
- Pull the repo
- Run npm install and npm run build inside frontend/
- Serve the built app from frontend/dist.

======================================================================
8. TESTING END-TO-END
======================================================================

1) Create a test user in Cognito and confirm them (or allow self-sign-up).
2) Log in via:
   - Local dev: http://localhost:5173 (Authenticator will redirect via Hosted UI).
   - Amplify URL: yourapp.amplifyapp.com
3) Once logged in:
   - Use the Upload Document panel to pick a small PDF or text file.
   - Click Upload & Summarize.
4) Confirm behavior:
   - File upload succeeds (no size error).
   - Summarize call returns a summary.
   - A new history entry is visible.
   - Clicking the history card shows the summary.
   - Clicking Delete removes the entry and no longer shows in history.

Also verify in AWS:
- S3: file object created under private/user-id/...
- DynamoDB: new item appears for that userId and createdAt.
- CloudWatch Logs: Lambdas run successfully.

======================================================================
9. SECURITY AND BEST PRACTICES
======================================================================

- Never hard-code secrets or AWS account IDs in the frontend.
- Keep all privileged values in AWS (IAM, environment variables, secret managers) and only expose what is safe (API base URL, region, etc.).
- Use least-privilege IAM policies:
  - Restrict S3 permissions to the specific bucket and prefix.
  - Restrict DynamoDB permissions to the single table.
  - Restrict Bedrock invocation to the specific model.
- Limit file size (this app uses 4.5 MB) to avoid Bedrock or Lambda limits and reduce cost.
- Ensure CORS is locked down to the actual origins you use rather than wildcard (*) in production.

======================================================================
10. TROUBLESHOOTING NOTES
======================================================================

Common issues and where to look:

1) CORS errors from the browser:
   - Check API Gateway CORS configuration for allowed origins and headers.
   - Check that your DELETE route uses the same CORS settings as GET/POST.
   - Confirm stage is deployed after config changes.

2) Unauthorized (401) or missing userId in Lambda:
   - Ensure JWT authorizer in API Gateway is using the correct Cognito issuer and audience (App Client ID).
   - Ensure frontend is sending Authorization: Bearer <idToken> (not accessToken) if your backend expects the "sub" claim.

3) 500 errors from summarize endpoint:
   - Check CloudWatch Logs for the research-summarize function.
   - Verify Bedrock model ID and region.
   - Check that S3 object can be read and that it is text or PDF that your parsing logic can handle.
   - Ensure file size is below the limit.

4) Delete endpoint returning 404 for DynamoDB item:
   - Ensure the route uses path parameter {fileKey+} so the whole key including slashes is captured.
   - Check that the fileKey in DynamoDB exactly matches what the frontend is sending.

======================================================================
11. HOW TO REUSE OR EXTEND THE PROJECT
======================================================================

Ideas for future enhancements:
- Add per-user tags or categories for summaries.
- Add pagination and filtering in history (e.g., by date or keyword).
- Add a detail page for each summary with additional metadata and optional notes.
- Support multiple summarization styles (bullet points, abstract, executive summary) by sending different prompts to Bedrock.
- Add support for OCR for scanned PDFs by piping through Amazon Textract before summarization.

======================================================================
12. QUICK STORY (SHORT VERSION)
======================================================================

“I built a serverless Research Summarizer on AWS. The frontend is a React app hosted with Amplify and protected by Cognito. Users upload research PDFs or text documents, which are stored in a private S3 bucket via presigned URLs. A Lambda function reads the document from S3 and calls Amazon Bedrock (Claude) to generate summaries. Another Lambda stores and retrieves summaries from a DynamoDB table and exposes history and delete endpoints via API Gateway. Everything is wired with JWT-based authorization, least-privilege IAM roles, and CORS so both local dev and production (Amplify) work cleanly.”

======================================================================
END OF README
======================================================================
