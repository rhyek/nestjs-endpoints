// The parts of this app's validation `scripts/breakdown.ts` takes out, one at a time, to measure
// what each costs. `main.ts` beside this file starts the app without the part `PART` names.
// No decorators here: the script imports this file as it is.
export const parts = {
  'no-key-removal': 'the schema pipe, without removing the prototype keys',
  'pass-through-pipe': 'a pipe that returns its value; the handlers parse their input',
  'no-pipe': 'no pipe; the handlers parse their input',
  'pass-through-interceptor':
    'an interceptor that only calls next.handle(); the handlers parse their output',
  'no-interceptor': 'no interceptor; the handlers parse their output',
  neither: 'no pipe and no interceptor; the handlers parse their input and their output',
} as const;

export type PartId = keyof typeof parts;

export const partIds = Object.keys(parts) as PartId[];
