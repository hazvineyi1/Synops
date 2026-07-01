// pdf-parse ships @types for its main entry ("pdf-parse") but not for the deep
// subpath we import to skip the package's debug block ("pdf-parse/lib/pdf-parse.js").
// The call site casts the import to `any`, so an untyped module declaration is
// sufficient to satisfy moduleResolution without changing behavior.
declare module "pdf-parse/lib/pdf-parse.js";
