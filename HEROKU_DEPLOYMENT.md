# Apex Mart Wholesale - Heroku Deployment Guide

## Prerequisites
- Heroku CLI installed (`brew install heroku` or download from heroku.com)
- Git installed
- Heroku account

## Step 1: Create Heroku App

```bash
heroku login
heroku create apex-mart-wholesale
```

## Step 2: Set Node.js Version

Add this to your `package.json` (in the root level):
```json
"engines": {
  "node": "20.x"
}
```

## Step 3: Configure Environment Variables

Set all required environment variables on Heroku:

```bash
# Database (PlanetScale PostgreSQL)
heroku config:set DATABASE_URL="your-planetscale-database-url"
heroku config:set PGHOST="us-east-3.pg.psdb.cloud"
heroku config:set PGDATABASE="your-database-name"
heroku config:set PGUSER="your-username"
heroku config:set PGPASSWORD="your-password"
heroku config:set PGPORT="5432"

# Authentication
heroku config:set SESSION_SECRET="your-secure-session-secret"

# Shopify Integration
heroku config:set SHOPIFY_STORE_URL="your-store.myshopify.com"
heroku config:set SHOPIFY_ACCESS_TOKEN="your-shopify-access-token"

# AWS S3 (for image storage)
heroku config:set AWS_ACCESS_KEY_ID="your-aws-key"
heroku config:set AWS_SECRET_ACCESS_KEY="your-aws-secret"
heroku config:set AWS_S3_BUCKET="your-bucket-name"
heroku config:set AWS_S3_REGION="your-region"

# Claude AI (for semantic search)
heroku config:set ANTHROPIC_API_KEY="your-anthropic-key"

# Production settings
heroku config:set NODE_ENV="production"
```

## Step 4: Deploy

```bash
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main
```

## Step 5: Verify Deployment

```bash
heroku open
heroku logs --tail
```

## Troubleshooting

### Build Fails
Check the build logs:
```bash
heroku logs --tail
```

### Database Connection Issues
Verify your DATABASE_URL is correctly set:
```bash
heroku config:get DATABASE_URL
```

### App Crashes
Check for errors in the logs:
```bash
heroku logs --tail --num 100
```

## Production URLs

After deployment, your app will be available at:
- `https://apex-mart-wholesale.herokuapp.com` (or your custom domain)

## Demo Accounts

- **Admin**: admin@apexmart.com / admin123
- **Merchant**: merchant@test.com / merchant123

## Important Notes

1. **Shopify App Configuration**: Update your Shopify app settings to point to your Heroku URL
2. **Database**: Uses PlanetScale PostgreSQL - ensure your IP is allowed
3. **Session Storage**: Uses memory store - consider Redis for production scale
4. **Background Sync**: Product sync runs in-memory - will reset on dyno restart

## Scaling

For production with 64,000+ products:
```bash
heroku ps:scale web=1:standard-1x
```

Consider adding a worker dyno for background tasks:
```bash
heroku ps:scale worker=1:standard-1x
```
