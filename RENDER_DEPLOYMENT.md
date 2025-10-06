# Render Deployment Guide

## Environment Variables

Set these environment variables in your Render dashboard:

### Required

- `API_KEYS`: Comma-separated list of API keys (e.g., "key1,key2,key3")
- `RENDER`: Set to `true` (this helps the app detect it's running on Render)

### Optional

- `CORS_ORIGINS`: Comma-separated list of allowed origins
- `RATE_LIMIT_PER_MIN`: Rate limit per minute (default: 60)
- `RATE_LIMIT_BURST`: Burst limit (default: 10)
- `DATABASE_URL`: PostgreSQL connection string for usage tracking
- `PORT`: Port number (Render will set this automatically)

## Build Configuration

### Build Command

```bash
npm run build
```

### Start Command

```bash
npm start
```

### Node Version

Use Node.js 18 or higher.

## Important Notes

1. **Chrome Installation**: The app now automatically detects Render environment and uses `@sparticuz/chromium` instead of requiring Chrome to be installed.

2. **Memory Limits**: Render free tier has memory limits. If you encounter memory issues, consider upgrading to a paid plan.

3. **Cold Starts**: Serverless functions may experience cold starts. The first request might be slower.

## Testing Your Deployment

After deployment, test with:

```bash
curl -H "Authorization: Bearer your-api-key" https://your-app.onrender.com/movie/597
```

## Troubleshooting

If you still get Chrome errors:

1. Ensure `RENDER=true` environment variable is set
2. Check that `@sparticuz/chromium` is in your dependencies
3. Verify your build completed successfully
