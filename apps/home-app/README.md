# Home App - AI App Generator Frontend

This is the frontend application for the AI App Generator SaaS platform. Users describe their app idea and the system generates the design, code, and deploys it to a live URL.

## Features

- **Prompt-based Generation**: Enter app description and get AI-generated design
- **Design Review**: Approve or reject generated design before code generation
- **Realtime Progress**: WebSocket-based progress tracking with status updates
- **Job Management**: Track all generated apps and their deployment status
- **Configuration Control**: Choose language, database, AI parameters

## Tech Stack

- **Framework**: Next.js 16+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **API Client**: Axios
- **Realtime**: Socket.io
- **Notifications**: React Hot Toast

## Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Update NEXT_PUBLIC_API_URL to point to backend
# NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
app/
├── layout.tsx           # Root layout with providers
├── page.tsx            # Home page
└── globals.css         # Global styles

components/
├── PromptForm.tsx      # App generation form
└── JobStatus.tsx       # Job tracking & design review

lib/
├── store.ts            # Zustand store for state management
└── api.ts              # API client and endpoints

hooks/
└── useProgressListener.ts  # WebSocket listener for realtime updates
```

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3001  # Backend API URL
```

## API Integration

This app communicates with the Agent Backend via:

1. **REST API**: 
   - `POST /api/generate` - Start app generation
   - `GET /api/jobs/:id` - Get job status
   - `POST /api/jobs/:id/approve-design` - Approve design

2. **WebSocket**:
   - Realtime progress updates
   - Status changes
   - Completion notifications

## Deployment

### Docker Build

```bash
docker build -t home-app:latest .
```

### Cloud Run

```bash
gcloud run deploy home-app \
  --image=gcr.io/PROJECT_ID/home-app:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars NEXT_PUBLIC_API_URL=https://agent-backend.run.app
```

## Performance Considerations

- Uses WebSocket for realtime updates (reduces polling)
- Zustand for lightweight state management
- Image optimization with Next.js Image component
- Code splitting with dynamic imports

## Security

- Environment variables for sensitive config
- HTTPS enforced in production
- CORS configuration in backend
- XSS protection via React

## Future Enhancements

- [ ] Authentication/Login
- [ ] App improvement workflow
- [ ] Version history and rollback
- [ ] Code export
- [ ] Team collaboration
- [ ] Analytics dashboard

## Contributing

1. Keep components focused and reusable
2. Use TypeScript for type safety
3. Follow Tailwind conventions
4. Test locally before pushing

## License

MIT
