import log from 'electron-log';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import fetch from 'electron-fetch';
import FormData from 'form-data';
import path from 'path';
import { obtainToken } from '../auth/service';
import packageJson from '../../../package.json';
import { ErrorDetails } from '../../workers/types';
import { BugReportResult } from './BugReportResult';

export async function sendReport({
  errorDetails,
  userComment,
  includeLogs,
}: {
  errorDetails: ErrorDetails;
  userComment: string;
  includeLogs: boolean;
}): Promise<BugReportResult> {
  const form = new FormData();

  const reportBody = {
    ...errorDetails,
    userComment,
    version: packageJson.version,
  };

  form.append('reportBody', JSON.stringify(reportBody));

  if (includeLogs) {
    form.append('logs', await readLog());
  }

  const res = await fetch(process.env.BUG_REPORTING_URL, {
    method: 'POST',
    body: form,
    headers: { Authorization: `Bearer ${obtainToken('bearerToken')}` },
  });

  if (res.ok) return { state: 'OK' };

  log.error(`Report status: ${res.status}`);

  if (res.status === 429) {
    return { state: 'TOO_MANY_REPORTS' };
  }

  log.error(
    `[BUG-REPORT] Request to report bug failed with status: ${res.status}`
  );
  return { state: 'ERROR' };
}

function readLog(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const logDir = path.parse(log.transports.file.getFile().path).dir;
    const logPath = path.join(logDir, 'renderer.log');

    const MAX_SIZE = 1024 * 1024 * 5;

    const { size } = await fs.lstat(logPath);

    const start = size > MAX_SIZE ? size - MAX_SIZE : 0;

    const stream = createReadStream(logPath, { start });

    const rawFile: string[] = [];

    stream.on('data', (buf: string) => rawFile.push(buf));
    stream.on('close', () => {
      resolve(rawFile.join());
    });
    stream.on('error', reject);
  });
}
