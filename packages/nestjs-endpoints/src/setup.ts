import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';
import { getCallsiteFile } from './helpers';

async function readPkgJson() {
  const start = path.dirname(getCallsiteFile());
  for (
    let dir = start;
    dir !== path.parse(dir).root && dir !== process.cwd();
    dir = path.dirname(dir)
  ) {
    const pkgJson = path.join(dir, 'package.json');
    if (await fs.stat(pkgJson).catch(() => false)) {
      const parsed = JSON.parse(await fs.readFile(pkgJson, 'utf-8'));
      if (parsed.name === 'nestjs-endpoints') {
        return parsed;
      }
    }
  }
  return null;
}

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
  Object.assign(document, {
    info: {
      ...document.info,
      'nestjs-endpoints': {
        version: (await readPkgJson())?.version ?? '1',
      },
    },
  });
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
        : path.resolve(path.dirname(getCallsiteFile()), outputFile);
      const currentDocument = await fs
        .readFile(documentFile, 'utf-8')
        .catch(() => '');
      if (currentDocument !== newDocument) {
        await fs.writeFile(documentFile, newDocument, 'utf-8');
        changed = true;
      }
    }
  }
  return { document, changed };
}
