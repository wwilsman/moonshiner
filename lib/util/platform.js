export function getPlatform() {
  let { platform, arch } = globalThis.process ?? {};
  if (platform === 'win32' && arch === 'x64') return 'win64';
  if (platform === 'darwin' && arch === 'arm64') return 'darwinArm';
  return platform;
}
