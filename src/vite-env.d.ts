/// <reference types="vite/client" />

// CSS modules
declare module '*.css' {
  const content: Record<string, string>
  export default content
}

// Allow importing CSS files from @fontsource
declare module '@fontsource/inter/*.css' {
  const content: string
  export default content
}

// Allow ?url imports for pdfjs worker
declare module '*?url' {
  const value: string
  export default value
}
