// Named as an endpoint file, with code that defines no endpoint.
export function unrelated() {
  throw new Error('never called');
}
