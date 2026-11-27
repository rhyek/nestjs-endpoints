// The port of the app these specs call, from this repository's block of local ports (22500 to
// 22549).
export const API_PORT = 22520;

// `pnpm dev` at the repository's root runs test-app-express on 22521, its default in
// src/main.ts, and this package's `dev` page calls it there (its `dev` script).
