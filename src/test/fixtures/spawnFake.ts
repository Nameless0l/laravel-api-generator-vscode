import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

export function spawnFake(mode = 'normal', protocol = 1): ChildProcess {
    return spawn(process.execPath, [path.join(__dirname, 'fakeWorker.js')], {
        env: { ...process.env, FAKE_WORKER_MODE: mode, FAKE_WORKER_PROTOCOL: String(protocol) },
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}
