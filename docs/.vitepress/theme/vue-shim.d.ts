// A single-file component, as far as the theme's entry point needs to know.
declare module '*.vue' {
  const component: object;
  export default component;
}
