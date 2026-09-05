- Please read the README.md file to understand what this project is about.
- The only deployable lives at packages/nestjs-endpoints
- There are five test projects at packages/test:
  - All test-app-\* projects are meant to test backend calls both regular http calls and using the generated axios client
  - I only write tests for those in packages/test/test-app-express-cjs, since scripts/test.sh copies the app and test source files to the other test-app-\* projects.
    - Main test file for http calls using supertest are in packages/test/test-app-express-cjs/test/app.e2e-spec.ts
    - Test file for calls using the axios client are in packages/test/test-app-express-cjs/test/client.e2e-spec.ts
    - Other files have specific purposes
  - packages/test/test-react-query-client is meant to test the generated react-query client.
    - You will need to first add code in packages/test/test-react-query-client/src that imports the client queries or mutations, and then add tests in packages/test/test-react-query-client/test

I'll sometimes ask you to look at how i impelmented something in a different project that i worked on in the past or currently. I want stuff i've solved there to help guide solutions for this project. you should never mention the other project by name or the fact there we're referencing any other project in any planning documents whether that's implementation phases, technical design docs, nothing, nor in source code. Especially important that no mention of the other project ever reaches source code as comments or otherwise during implementation.
