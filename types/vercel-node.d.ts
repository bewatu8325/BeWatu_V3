// The request and response types of Vercel's Node.js functions. The api/ routes import only these TYPES from '@vercel/node';
// the code that runs them is supplied by Vercel at build time, not by this project's node_modules. The package itself is not
// installed: it pinned old versions of undici, path-to-regexp and others that npm audit (rightly) flagged, for code this project
// never runs. Copied from @vercel/node's own dist/index.d.ts, unchanged. If a route needs another export, add it here.
declare module '@vercel/node' {
  import type { IncomingMessage, ServerResponse } from 'node:http';
  export type VercelRequestCookies = { [key: string]: string };
  export type VercelRequestQuery = { [key: string]: string | string[] };
  export type VercelRequestBody = any;
  export type VercelRequest = IncomingMessage & {
    query: VercelRequestQuery;
    cookies: VercelRequestCookies;
    body: VercelRequestBody;
  };
  export type VercelResponse = ServerResponse & {
    send: (body: any) => VercelResponse;
    json: (jsonBody: any) => VercelResponse;
    status: (statusCode: number) => VercelResponse;
    redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
  };
  export type VercelApiHandler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;
}
