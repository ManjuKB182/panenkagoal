import { liveResponse } from '../../src/lib/live';

// Cloudflare Pages Function: GET /api/live
export const onRequestGet = () => liveResponse();
