import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(toolDirectory);
const source = path.join(projectDirectory, 'src', 'renderer');
const destination = path.join(projectDirectory, 'dist', 'renderer');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

