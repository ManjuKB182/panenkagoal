import { matchResponse } from '../../src/lib/match';

// Cloudflare Pages Function: GET /api/match?id=isl-194640
export const onRequestGet = ({ request }: { request: Request }) => matchResponse(new URL(request.url).searchParams.get('id'));
