import Module from 'module';

// 'vscode' only resolves inside the editor; importing this first lets tests load modules that depend on it.
const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = loader._load;

loader._load = function (request: string, ...rest: unknown[]) {
    if (request === 'vscode') {
        return {};
    }
    return originalLoad.call(this, request, ...rest);
};
