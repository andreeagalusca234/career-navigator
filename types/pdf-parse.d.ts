declare module "pdf-parse" {
  export class PDFParse {
    constructor(input: { data: Buffer });
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  }
}
