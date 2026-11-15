export type Scenario = {
  id: string;
  title: string;
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  status: number;
  /**
   * `bytes`: both apps must answer with the same status, content type and body. `status`: only the
   * status must match; each framework words its validation errors its own way.
   */
  parity: 'bytes' | 'status';
};

const validUser = {
  name: 'Ana López',
  email: 'ana@example.com',
  age: 34,
  roles: ['editor', 'viewer'],
  address: { street: '4a Avenida 12-59', city: 'Guatemala City', country: 'GT', zip: '01010' },
  profile: { bio: 'Backend engineer.', website: 'https://ana.example.com' },
};

// Fails five rules at once, across nested objects and an array.
const invalidUser = {
  name: '',
  email: 'not-an-email',
  age: -1,
  roles: ['root'],
  address: { street: '4a Avenida 12-59', city: 'Guatemala City', country: 'GTM', zip: '01010' },
};

export const scenarios: Scenario[] = [
  {
    id: 'baseline',
    title: 'GET, no schemas',
    method: 'GET',
    path: '/health',
    status: 200,
    parity: 'bytes',
  },
  {
    id: 'params-query',
    title: 'GET, path + query params, object output',
    method: 'GET',
    path: '/user/42?include=profile',
    status: 200,
    parity: 'bytes',
  },
  {
    id: 'valid-body',
    title: 'POST, valid JSON object in, object out',
    method: 'POST',
    path: '/users/create',
    body: validUser,
    status: 200,
    parity: 'bytes',
  },
  {
    id: 'invalid-body',
    title: 'POST, invalid JSON object (400)',
    method: 'POST',
    path: '/users/create',
    body: invalidUser,
    status: 400,
    parity: 'status',
  },
  {
    id: 'list',
    title: 'GET, 50-item list output',
    method: 'GET',
    path: '/users/list',
    status: 200,
    parity: 'bytes',
  },
];
