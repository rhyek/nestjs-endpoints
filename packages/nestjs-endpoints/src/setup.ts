import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';

export async function setupOpenAPI(
  app: INestApplication,
  options?: {
    configure?: (documentBuilder: DocumentBuilder) => void;
    outputFile?: string | Writable;
  },
) {
  patchNestJsSwagger();
  const builder = new DocumentBuilder();
  if (options?.configure) {
    options.configure(builder);
  }
  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  let changed = false;

  if (options?.outputFile) {
    const outputFile = options.outputFile;
    const newDocument = JSON.stringify(document, null, 2);

    if (outputFile instanceof Writable) {
      await new Promise<void>((resolve, reject) => {
        outputFile.write(newDocument, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      changed = true;
    } else {
      const documentFile = path.isAbsolute(outputFile)
        ? outputFile
        : path.resolve(process.cwd(), outputFile);
      const currentDocument = await readFile(documentFile, 'utf-8').catch(
        () => '',
      );
      if (currentDocument !== newDocument) {
        await writeFile(documentFile, newDocument, 'utf-8');
        changed = true;
      }
    }
  }
  return { document, changed };
}
