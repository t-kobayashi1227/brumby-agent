export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が設定されていません（.env.local を確認してください）`);
  }
  return value;
}
